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
        self.model = os.getenv("LLM_MODEL", "qwen2.5-coder:32b")
        
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
        """从 Nextflow 代码提取参数生成 Schema"""
        properties = {}
        pattern = re.compile(r'^\s*params\.(\w+)\s*=\s*(.+?)\s*(?://.*)?$', re.MULTILINE)
        matches = pattern.findall(nf_code)
        
        for key, raw_val in matches:
            val = raw_val.strip()
            param_type = "string"
            default_val = None
            title = key.replace('_', ' ').title()
            
            if val == 'null':
                param_type = "string"
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

    def _extract_code_block(self, text: str, mode: str) -> Dict[str, Any]:
        """提取器：支持多语言代码块和可选的 JSON Schema 提取"""
        clean_text = self._clean_response(text)
        
        # 1. 提取主代码 (扩大支持范围: python, r, perl 等)
        code_pattern = r'```(?:groovy|nextflow|python|r|perl|bash|sh)?\s*\n(.*?)\n\s*```'
        match = re.search(code_pattern, clean_text, re.DOTALL)
        
        if match:
            extracted_code = match.group(1).strip()
            explanation = re.sub(code_pattern, '', clean_text, flags=re.DOTALL).strip()
            
            params_schema = "{}"
            
            # 2. 如果是 TOOL 模式，尝试从 AI 输出中提取 JSON Schema 代码块
            if mode == "TOOL":
                json_pattern = r'```json\s*\n(.*?)\n\s*```'
                json_match = re.search(json_pattern, clean_text, re.DOTALL)
                if json_match:
                    try:
                        # 验证是否为合法 JSON
                        parsed = json.loads(json_match.group(1).strip())
                        params_schema = json.dumps(parsed, indent=2)
                    except json.JSONDecodeError:
                        params_schema = "{}"
                # 将 json 块从说明文字中移除
                explanation = re.sub(json_pattern, '', explanation, flags=re.DOTALL).strip()
            else:
                # PIPELINE/MODULE 从代码自动反向提取
                params_schema = self._generate_params_schema(extracted_code)
            
            explanation = explanation[:200] + "..." if len(explanation) > 200 else explanation
            
            return {
                "main_nf": extracted_code,
                "params_schema": params_schema,
                "description": "Generated via Markdown Extraction",
                "explanation": explanation or "Code generated successfully."
            }
        else:
            print(f"⚠️ No code block found. Raw text snippet: {clean_text[:50]}...")
            if "process " in clean_text or "workflow {" in clean_text or "import " in clean_text:
                params_schema = self._generate_params_schema(clean_text) if mode != "TOOL" else "{}"
                return {
                    "main_nf": clean_text,
                    "params_schema": params_schema, 
                    "description": "Raw Text Fallback",
                    "explanation": "AI did not use markdown blocks."
                }
            
            return self._error_fallback(clean_text, "No markdown code block found")

    def _error_fallback(self, raw_text: str, error_msg: str) -> Dict[str, Any]:
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

    def _static_analysis(self, code: str, mode: str) -> List[str]:
        """本地静态规则"""
        errors = []
        # 工具代码 (Python/R) 不需要进行 Nextflow 的特有语法检查
        if mode in ["PIPELINE", "MODULE"]:
            if re.search(r'output\s*:[^}]*publishDir', code, re.DOTALL):
                errors.append("SYNTAX ERROR: `publishDir` must be placed BEFORE `input:` or `output:` blocks.")
            if re.search(r'def\s+\w+\s*\(.*?\)\s*\{\s*process\s+', code, re.DOTALL):
                errors.append("DSL2 VIOLATION: Do NOT wrap `process` definitions inside Groovy functions.")
            if re.search(r'--\w+\s+\$\{?params\.\w+(index|ref|genome|db)\w*\}?', code, re.IGNORECASE):
                errors.append("CONTAINER ERROR: Do not use `params.index` in script. Pass it as `input: path index`.")
        return errors

    def generate_workflow(self, messages: List[Dict[str, str]], mode: str = "MODULE", available_modules: str = "") -> Dict[str, Any]:
        """Agentic Workflow"""
        print(f"🚀 Step 1: Drafting code for mode: {mode}...")
        draft_response = self._generate_draft(messages, mode, available_modules)
        
        if not draft_response:
             return self._error_fallback("", "LLM Connection Failed")

        current_data = self._extract_code_block(draft_response, mode)
        
        if current_data["main_nf"].startswith("// GENERATION ERROR"):
            return current_data

        # === Step 2: Refine Loop ===
        for attempt in range(2):
            code = current_data["main_nf"]
            detected_errors = self._static_analysis(code, mode)
            
            if not detected_errors:
                print("✅ Static Analysis passed.")
                break 
            
            print(f"⚠️ Step 2 (Attempt {attempt+1}): Found bugs: {detected_errors}")
            
            refine_prompt = "Your previous code had CRITICAL ERRORS:\n"
            for i, err in enumerate(detected_errors):
                refine_prompt += f"{i+1}. {err}\n"
            refine_prompt += "\nPlease rewrite the code in a markdown block."
            
            current_data = self._refine_code(current_data, refine_prompt, mode)

        return current_data

    def _generate_draft(self, messages: List[Dict[str, str]], mode: str, available_modules: str) -> str:
        backticks = "`" * 3
        
        # 基础 Prompt
        base_prompt = """
You are an expert Bioinformatics Developer.
DO NOT output raw JSON for the entire response.

ANTI-PATTERNS:
1. NO DSL1 Syntax (def process) for Nextflow.
2. NO publishDir inside output.
"""
        
        if mode == "TOOL":
            # 针对工具的 Prompt，植入了你要求的“规范”、“注释”、“参数系统”、“TSV优先”等要求
            template = backticks + "python\nimport argparse\nimport pandas as pd\n\ndef main():\n    # Initialize argument parser\n    parser = argparse.ArgumentParser(description='Your Tool Description')\n    parser.add_argument('--input', type=str, required=True, help='Input file')\n    parser.add_argument('--output', type=str, default='output.tsv', help='Output TSV file')\n    args = parser.parse_args()\n    \n    # Process data...\n\nif __name__ == '__main__':\n    main()\n" + backticks
            mode_instruction = f"""MODE: TOOL (Standalone Script)
TASK:
- Create a standalone script (Python, R, or Perl) to perform data analysis, formatting, or visualization (e.g., Heatmap, Venn).
- CODE QUALITY: MUST include highly detailed comments and program explanations. Retain all explanations when modifying code.
- PARAMETERS: MUST use a robust parameter parsing system (e.g., `argparse` in Python, `optparse` in R). Support default values.
- OUTPUT FORMAT: If outputting tables, prefer tab-separated TSV format.

FORMAT REQUIREMENT:
1. Write the script code inside a {backticks}python (or r, perl) block.
2. You MUST ALSO generate a Draft-07 JSON Schema corresponding to your script's parameters inside a {backticks}json block. This schema will build the UI.
Example structure:
{template}
"""
        elif mode == "MODULE":
            template = backticks + "groovy\nparams.outdir = './results'\n\nprocess NAME {\n    tag \"$meta.id\"\n    label 'process_medium'\n    publishDir \"${params.outdir}/name\", mode: 'copy'\n\n    input:\n    tuple val(meta), path(reads)\n    path index \n\n    output:\n    tuple val(meta), path(\"*.bam\"), emit: bam\n\n    script:\n    \"\"\"\n    tool_command --threads ${task.cpus} input output\n    \"\"\"\n}\n" + backticks
            mode_instruction = f"MODE: MODULE (Nextflow Process).\nCreate a single `process`. Define parameters at the top using `params.name = value`. Use this structure:\n{template}"
        else: 
            code_block = backticks + "groovy\n// Define default parameters\nparams.input = null\nparams.outdir = './results'\n\nChannel.fromPath(params.input)\n    .splitCsv(header:true)\n    .map{ row ->\n        def meta = [id: row.sample_id]\n        def reads = row.r2_path ? [file(row.r1_path), file(row.r2_path)] : [file(row.r1_path)]\n        return tuple(meta, reads)\n    }\n    .set { ch_input }\n" + backticks
            mode_instruction = f"MODE: PIPELINE (Nextflow Workflow).\nStart with standard input logic:\n{code_block}\nAvailable Modules:\n{available_modules}"

        system_prompt = base_prompt + "\n" + mode_instruction
        msgs = [{"role": "system", "content": system_prompt}] + messages
        return self._call_llm(msgs)

    def _refine_code(self, current_data: Dict[str, Any], instructions: str, mode: str) -> Dict[str, Any]:
        code_to_check = current_data["main_nf"]
        backticks = "`" * 3
        
        refine_prompt = f"""
{instructions}

CURRENT CODE:
{backticks}
{code_to_check}
{backticks}

Return the FIXED code in a proper markdown block.
"""
        msgs = [{"role": "user", "content": refine_prompt}]
        response_text = self._call_llm(msgs)
        return self._extract_code_block(response_text, mode)

llm_client = LLMClient()