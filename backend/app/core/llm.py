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
        # 默认使用 deepseek-r1:32b
        self.model = os.getenv("LLM_MODEL", "deepseek-r1:32b")
        
        self.client = OpenAI(
            base_url=self.base_url,
            api_key=self.api_key
        )

    def _clean_think_block(self, text: str) -> str:
        """移除 DeepSeek/Qwen 的 <think> 思考过程"""
        # 移除成对的 think 标签
        text = re.sub(r'<think>.*?</think>', '', text, flags=re.DOTALL)
        # 移除只有开始标签的情况（防止截断导致残留）
        text = re.sub(r'<think>.*', '', text, flags=re.DOTALL)
        return text.strip()

    def _extract_json(self, text: str) -> Dict[str, Any]:
        """
        [修复版] JSON 提取器
        修复了 NameError: name 'e' is not defined 的 bug
        """
        # 1. 清洗
        cleaned_text = self._clean_think_block(text)
        
        # 2. 暴力寻找最外层大括号
        start_idx = cleaned_text.find('{')
        end_idx = cleaned_text.rfind('}')

        if start_idx != -1 and end_idx != -1 and end_idx > start_idx:
            json_str = cleaned_text[start_idx : end_idx + 1]
        else:
            print(f"❌ JSON Extract Failed. No curly braces found. Content start: {cleaned_text[:100]}...")
            return self._error_fallback(cleaned_text, "No JSON object found (missing { })")

        # 3. 尝试解析
        try:
            return json.loads(json_str)
        except json.JSONDecodeError as e:  # 👈 之前漏了 'as e'
            print(f"⚠️ JSON Decode Error: {e}. Content snippet: {json_str[:100]}...")
            # 返回错误信息给前端，而不是让后端崩溃
            return self._error_fallback(json_str, f"Invalid JSON syntax: {str(e)}")

    def _error_fallback(self, raw_text: str, error_msg: str) -> Dict[str, Any]:
        """兜底返回，确保前端总是能收到数据"""
        # 将错误信息包装成注释，写入 main_nf，这样用户在编辑器里能直接看到报错原因
        safe_raw_text = raw_text.replace("*/", "* /") # 防止注释嵌套破坏
        return {
            "main_nf": f"// AI GENERATION FAILED\n// Error: {error_msg}\n// Please try again.\n\n/* \nRAW AI OUTPUT:\n{safe_raw_text}\n*/", 
            "params_schema": "{}", 
            "description": "Error parsing AI response",
            "explanation": f"AI did not return valid JSON. {error_msg}"
        }

    def _call_llm(self, messages: List[Dict[str, str]]) -> str:
        """统一的 LLM 调用接口"""
        try:
            print(f"🤖 Sending {len(messages)} messages to {self.model}...")
            response = self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=0.1, # 低温度，越低越严谨
                max_tokens=8192
            )
            content = response.choices[0].message.content
            print(f"✅ LLM Response received ({len(content)} chars).")
            return content
        except Exception as e:
            print(f"❌ LLM API Error: {e}")
            # 这里抛出异常会被 FastAPI 捕获为 500，导致前端报错
            # 我们最好返回一个空的错误字符串，让上层处理
            return "{}" 

    def _static_analysis(self, code: str) -> List[str]:
        """本地静态分析规则"""
        errors = []

        # 规则1: publishDir 位置
        if re.search(r'output\s*:[^}]*publishDir', code, re.DOTALL):
            errors.append("SYNTAX ERROR: `publishDir` directive MUST be placed BEFORE `input:` or `output:` blocks.")

        # 规则2: DSL1 def 定义
        if re.search(r'def\s+\w+\s*\(.*?\)\s*\{\s*process\s+', code, re.DOTALL):
            errors.append("DSL2 VIOLATION: Do NOT wrap `process` definitions inside Groovy functions.")

        # 规则3: Script 内直接引用 params.index
        if re.search(r'--\w+\s+\$\{?params\.\w+(index|ref|genome|db)\w*\}?', code, re.IGNORECASE):
            errors.append("CONTAINER ERROR: Do not use `params.index` in script. Pass it as `input: path index`.")

        return errors

    def generate_workflow(
        self, 
        messages: List[Dict[str, str]], 
        mode: str = "MODULE",
        available_modules: str = ""
    ) -> Dict[str, Any]:
        """
        Agentic Workflow
        """
        
        # === Step 1: Draft ===
        print("🚀 Step 1: Drafting code...")
        draft_response = self._generate_draft(messages, mode, available_modules)
        
        # 如果调用 LLM 失败（比如超时或没连上），draft_response 可能是 "{}"
        if not draft_response or draft_response == "{}":
             return self._error_fallback("", "LLM API connection failed or returned empty.")

        current_json = self._extract_json(draft_response)
        
        # 如果 Draft 解析失败，直接返回，不进行后续修复
        if current_json.get("main_nf", "").startswith("// AI GENERATION FAILED"):
            return current_json

        # === Step 2: Refine Loop ===
        max_attempts = 2
        for attempt in range(max_attempts):
            code = current_json.get("main_nf", "")
            detected_errors = self._static_analysis(code)
            
            if not detected_errors:
                print("✅ Static Analysis passed.")
                break 
            
            print(f"⚠️ Step 2 (Attempt {attempt+1}/{max_attempts}): Found bugs: {detected_errors}")
            
            refine_prompt = "Your previous code had CRITICAL ERRORS. Fix them and return strictly JSON:\n"
            for i, err in enumerate(detected_errors):
                refine_prompt += f"{i+1}. {err}\n"
            
            current_json = self._refine_code(current_json, refine_prompt)
            
            # 如果修复过程中解析失败，停止尝试
            if current_json.get("main_nf", "").startswith("// AI GENERATION FAILED"):
                break

        # === Step 3: Polish ===
        # 只有当前代码正常时才进行润色
        if not current_json.get("main_nf", "").startswith("// AI GENERATION FAILED"):
            print("🧐 Step 3: Final polish...")
            final_checklist = "Ensure `task.cpus` is used. Check .gz handling. Return STRICT JSON."
            current_json = self._refine_code(current_json, final_checklist)
        
        return current_json

    def _generate_draft(self, messages: List[Dict[str, str]], mode: str, available_modules: str) -> str:
        """Step 1 Prompt"""
        backticks = "`" * 3
        
        base_prompt = """
You are an expert Nextflow DSL2 Developer.
Output STRICT JSON only.

ANTI-PATTERNS:
1. NO DSL1 Syntax (def process).
2. NO publishDir inside output.
"""
        
        if mode == "MODULE":
            template = backticks + "groovy" + """
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
    def args = task.ext.args ?: ''
    \"\"\"
    tool_command --threads ${task.cpus} input output
    \"\"\"
}
""" + backticks
            mode_instruction = f"MODE: MODULE. Create a single `process`. Follow this TEMPLATE:\n{template}"
        else: 
            code_block = backticks + "groovy" + """
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

    def _refine_code(self, draft_json: Dict[str, Any], instructions: str) -> Dict[str, Any]:
        """Refine Prompt"""
        code_to_check = draft_json.get("main_nf", "")
        backticks = "`" * 3
        
        refine_prompt = f"""
{instructions}

CURRENT CODE:
{backticks}groovy
{code_to_check}
{backticks}

Output VALID JSON with "main_nf" key.
"""
        msgs = [{"role": "user", "content": refine_prompt}]
        response_text = self._call_llm(msgs)
        return self._extract_json(response_text)

llm_client = LLMClient()