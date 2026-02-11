import os
import json
import re
from openai import OpenAI
from typing import Dict, Any, Optional, List

class LLMClient:
    def __init__(self):
        self.provider = os.getenv("LLM_PROVIDER", "ollama")
        self.base_url = os.getenv("LLM_BASE_URL", "http://host.docker.internal:11434/v1")
        self.api_key = os.getenv("LLM_API_KEY", "ollama")
        # 推荐使用 qwen2.5-coder:32b 或 deepseek-r1:32b
        self.model = os.getenv("LLM_MODEL", "deepseek-r1:70b")
        
        self.client = OpenAI(
            base_url=self.base_url,
            api_key=self.api_key
        )

    def _clean_response(self, text: str) -> str:
        """清洗 DeepSeek <think> 标签"""
        text = re.sub(r'<think>.*?</think>', '', text, flags=re.DOTALL)
        text = re.sub(r'<think>.*', '', text, flags=re.DOTALL)
        return text.strip()

    def _generate_params_schema(self, nf_code: str) -> str:
        """
        [参数提取引擎] 
        从 Nextflow 代码中通过正则提取 `params.x = y`，自动生成 JSON Schema。
        """
        properties = {}
        
        # 正则逻辑：
        # 1. 匹配行首(允许空格)的 params.变量名
        # 2. 匹配 = 后的值
        # 3. 忽略行尾注释 (// ...)
        pattern = re.compile(r'^\s*params\.(\w+)\s*=\s*(.+?)\s*(?://.*)?$', re.MULTILINE)
        
        matches = pattern.findall(nf_code)
        
        for key, raw_val in matches:
            # 清理值（去引号、空格）
            val = raw_val.strip()
            param_type = "string"
            default_val = None
            title = key.replace('_', ' ').title() # 将 snake_case 转为 Title Case
            
            # 智能推断类型
            if val == 'null':
                param_type = "string" # Nextflow null 通常用于待传入的文件路径
                default_val = None
            elif val == 'true' or val == 'false':
                param_type = "boolean"
                default_val = (val == 'true')
            elif val.startswith("'") or val.startswith('"'):
                param_type = "string"
                default_val = val.strip("'\"")
            elif val.isdigit():
                param_type = "integer"
                default_val = int(val)
            else:
                # 可能是复杂表达式或变量引用，默认为 string，保留原值
                default_val = val
            
            properties[key] = {
                "type": param_type,
                "title": title,
                "default": default_val
            }
            
        schema = {
            "type": "object",
            "properties": properties,
            "required": []
        }
        
        return json.dumps(schema, indent=2)

    def _extract_code_block(self, text: str) -> Dict[str, Any]:
        """
        [Markdown 提取器 + 参数生成器]
        """
        clean_text = self._clean_response(text)
        
        # 1. 提取代码块
        code_pattern = r'```(?:groovy|nextflow)?\s*\n(.*?)\n\s*```'
        match = re.search(code_pattern, clean_text, re.DOTALL)
        
        if match:
            extracted_code = match.group(1).strip()
            explanation = re.sub(code_pattern, '', clean_text, flags=re.DOTALL).strip()
            explanation = explanation[:200] + "..." if len(explanation) > 200 else explanation
            
            # 2. 自动生成 Schema (新增功能)
            params_schema = self._generate_params_schema(extracted_code)
            
            return {
                "main_nf": extracted_code,
                "params_schema": params_schema, # ✅ 现在有值了
                "description": "Generated via Markdown Extraction",
                "explanation": explanation or "Code generated successfully."
            }
        else:
            # 兜底逻辑
            print(f"⚠️ No code block found. Raw text snippet: {clean_text[:50]}...")
            
            if "process " in clean_text or "workflow {" in clean_text:
                # 尝试从纯文本中生成 Schema
                params_schema = self._generate_params_schema(clean_text)
                return {
                    "main_nf": clean_text,
                    "params_schema": params_schema, 
                    "description": "Raw Text Fallback",
                    "explanation": "AI did not use markdown blocks."
                }
            
            return self._error_fallback(clean_text, "No markdown code block found (```groovy)")

    def _error_fallback(self, raw_text: str, error_msg: str) -> Dict[str, Any]:
        """错误兜底"""
        safe_text = raw_text.replace("*/", "* /")
        return {
            "main_nf": f"// GENERATION ERROR\n// {error_msg}\n\n/*\n{safe_text}\n*/",
            "params_schema": "{}",
            "description": "Error",
            "explanation": error_msg
        }

    def _call_llm(self, messages: List[Dict[str, str]]) -> str:
        try:
            print(f"🤖 Sending request to {self.model}...")
            response = self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=0.1, 
                max_tokens=8192
            )
            return response.choices[0].message.content
        except Exception as e:
            print(f"❌ LLM API Error: {e}")
            return ""

    def _static_analysis(self, code: str) -> List[str]:
        """本地静态规则"""
        errors = []
        if re.search(r'output\s*:[^}]*publishDir', code, re.DOTALL):
            errors.append("SYNTAX ERROR: `publishDir` must be placed BEFORE `input:` or `output:` blocks.")
        if re.search(r'def\s+\w+\s*\(.*?\)\s*\{\s*process\s+', code, re.DOTALL):
            errors.append("DSL2 VIOLATION: Do NOT wrap `process` definitions inside Groovy functions.")
        if re.search(r'--\w+\s+\$\{?params\.\w+(index|ref|genome|db)\w*\}?', code, re.IGNORECASE):
            errors.append("CONTAINER ERROR: Do not use `params.index` in script. Pass it as `input: path index`.")
        return errors

    def generate_workflow(self, messages: List[Dict[str, str]], mode: str = "MODULE", available_modules: str = "") -> Dict[str, Any]:
        """Agentic Workflow"""
        print("🚀 Step 1: Drafting code...")
        draft_response = self._generate_draft(messages, mode, available_modules)
        
        if not draft_response:
             return self._error_fallback("", "LLM Connection Failed")

        current_data = self._extract_code_block(draft_response)
        
        if current_data["main_nf"].startswith("// GENERATION ERROR"):
            return current_data

        # === Step 2: Refine Loop ===
        for attempt in range(2):
            code = current_data["main_nf"]
            detected_errors = self._static_analysis(code)
            
            if not detected_errors:
                print("✅ Static Analysis passed.")
                break 
            
            print(f"⚠️ Step 2 (Attempt {attempt+1}): Found bugs: {detected_errors}")
            
            refine_prompt = "Your previous code had CRITICAL ERRORS:\n"
            for i, err in enumerate(detected_errors):
                refine_prompt += f"{i+1}. {err}\n"
            refine_prompt += "\nPlease rewrite the code in a ```groovy block."
            
            # Refine 后重新提取，也会重新生成 params_schema
            current_data = self._refine_code(current_data, refine_prompt)

        return current_data

    def _generate_draft(self, messages: List[Dict[str, str]], mode: str, available_modules: str) -> str:
        """Step 1 Prompt"""
        
        base_prompt = """
You are an expert Nextflow DSL2 Developer.
Please generate the Nextflow code.

FORMAT REQUIREMENT:
1. Write the Nextflow code inside a ```groovy code block.
2. Define parameters at the top using `params.name = value` syntax.
3. DO NOT output JSON.
"""
        backticks = "`" * 3
        
        if mode == "MODULE":
            template = backticks + "groovy" + """
params.outdir = './results'

process NAME {
    tag "$meta.id"
    label 'process_medium'
    publishDir "${params.outdir}/name", mode: 'copy'

    input:
    tuple val(meta), path(reads)
    path index 

    output:
    tuple val(meta), path("*.bam"), emit: bam

    script:
    \"\"\"
    tool_command --threads ${task.cpus} input output
    \"\"\"
}
""" + backticks
            mode_instruction = f"MODE: MODULE. Create a single `process`. Use this structure:\n{template}"
        else: 
            code_block = backticks + "groovy" + """
// Define default parameters
params.input = null
params.outdir = './results'

Channel.fromPath(params.input)
    .splitCsv(header:true)
    .map{ row ->
        def meta = [id: row.sample_id]
        def reads = row.r2_path ? [file(row.r1_path), file(row.r2_path)] : [file(row.r1_path)]
        return tuple(meta, reads)
    }
    .set { ch_input }
""" + backticks
            mode_instruction = f"MODE: PIPELINE. Start with standard input logic:\n{code_block}\nAvailable Modules:\n{available_modules}"

        system_prompt = base_prompt + "\n" + mode_instruction
        msgs = [{"role": "system", "content": system_prompt}] + messages
        return self._call_llm(msgs)

    def _refine_code(self, current_data: Dict[str, Any], instructions: str) -> Dict[str, Any]:
        """Refine Prompt"""
        code_to_check = current_data["main_nf"]
        backticks = "`" * 3
        
        refine_prompt = f"""
{instructions}

CURRENT CODE:
{backticks}groovy
{code_to_check}
{backticks}

Return the FIXED code in a ```groovy block. Ensure `params` are defined at the top.
"""
        msgs = [{"role": "user", "content": refine_prompt}]
        response_text = self._call_llm(msgs)
        return self._extract_code_block(response_text)

llm_client = LLMClient()