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
        # 建议使用 qwen2.5-coder:32b，它对指令遵循和多语言支持最好
        self.model = os.getenv("LLM_MODEL", "qwen2.5-coder:32b")
        
        self.client = OpenAI(
            base_url=self.base_url,
            api_key=self.api_key
        )

    def _clean_response(self, text: str) -> str:
        """清洗 DeepSeek/Qwen 的 <think> 标签及其他无关内容"""
        text = re.sub(r'<think>.*?</think>', '', text, flags=re.DOTALL)
        text = re.sub(r'<think>.*', '', text, flags=re.DOTALL)
        return text.strip()

    def _detect_language_request(self, messages: List[Dict[str, str]]) -> str:
        """
        [智能语言探测]
        从用户历史消息中推断目标语言。
        """
        combined_text = " ".join([m.get("content", "").lower() for m in messages])
        
        # 1. 显式 R 语言关键词
        if any(kw in combined_text for kw in ["r script", "r language", "write r code", ".r file", "r code"]):
            return "R"
            
        # 2. R 语言特有的生信包/函数关键词 (隐式推断)
        r_keywords = [
            "pheatmap", "ggplot", "tidyverse", "deseq2", "seurat", "limma", 
            "bioconductor", "complexheatmap", "shiny", "optparse"
        ]
        if any(kw in combined_text for kw in r_keywords):
            return "R"

        # 3. 其他语言
        if "perl" in combined_text:
            return "Perl"
        if "python" in combined_text or "pandas" in combined_text or "matplotlib" in combined_text:
            return "Python"
            
        # 默认 Python
        return "Python"

    def _generate_params_schema(self, code: str) -> str:
        """(Fallback) 尝试从代码文本中反向生成简单的 JSON Schema"""
        # 这是一个简单的兜底策略，针对 Pipeline 模式
        return json.dumps({
            "type": "object",
            "properties": {
                "input": {"type": "string", "title": "Input File", "default": None},
                "outdir": {"type": "string", "title": "Output Directory", "default": "./results"}
            }
        }, indent=2)

    def generate_schema_from_code(self, code: str, mode: str) -> str:
        """
        [升级版] 从代码反向解析生成 JSON Schema (Draft-07)
        增强了对 R (optparse) 和 Python (argparse) 的解析能力，支持 Enum 和类型推断。
        """
        prompt = f"""
You are a Senior Bioinformatics Pipeline Engineer.
Your task is to analyze the provided script code and generate a corresponding **Draft-07 JSON Schema** for its input parameters.
This schema will be used to generate a Web UI form.

### ANALYSIS STRATEGY:

#### 1. Python Scripts (using `argparse`)
- **Scan**: Look for `parser.add_argument(...)`.
- **Name**: Extract `--name` (strip hyphens).
- **Type Mapping**: 
  - `type=str` -> `"string"`
  - `type=int` -> `"integer"`
  - `type=float` -> `"number"`
  - `action='store_true'` -> `"boolean"` (and set `default: false`)
- **Enum**: If `choices=[...]` is present, generate `"enum": [...]`.
- **Default**: Extract `default=...` value.
- **Required**: If `required=True` is set, add parameter name to `"required"` list.

#### 2. R Scripts (using `optparse`)
- **Scan**: Look for `make_option(c("-f", "--flag"), ...)`
- **Name**: Extract long flag `--flag` (strip hyphens).
- **Type Mapping**:
  - `type="character"` -> `"string"`
  - `type="integer"` -> `"integer"`
  - `type="double"` or `type="numeric"` -> `"number"`
  - `type="logical"` -> `"boolean"`
  - `action="store_true"` -> `"boolean"`
- **Default**: Extract `default=...` (handle `NULL` as null).

#### 3. Nextflow
- **Scan**: Look for `params.variable = value` at the top of the file.
- **Type**: Infer from value (quote -> string, number -> number, true/false -> boolean).

### OUTPUT RULES:
1. Return **ONLY** the valid JSON string.
2. The root object must have `"type": "object"` and `"properties"`.
3. Include `"title"`, `"description"` and `"default"` fields where possible.

### SOURCE CODE:
{backticks}
{code}
{backticks}
"""
        messages = [{"role": "user", "content": prompt}]
        
        try:
            print(f"🔍 [LLM] Analyzing code to extract schema ({self.model})...")
            
            # 尝试启用 JSON 模式 (增加确定性)
            kwargs = {}
            # 注意: 并非所有模型/代理都支持 response_format，这里做一个安全检查
            # 如果你的 backend 确定支持 OpenAI 格式的 json_object，可以取消注释下面两行
            # kwargs["response_format"] = {"type": "json_object"}

            response = self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=0.1, # 低温以保证逻辑严密
                max_tokens=4096,
                **kwargs
            )
            raw_text = response.choices[0].message.content
        except Exception as e:
            print(f"❌ LLM Error in generate_schema: {e}")
            return json.dumps({"type": "object", "properties": {}}, indent=2)

        # === 鲁棒的 JSON 提取逻辑 ===
        clean_text = self._clean_response(raw_text)
        
        # 1. 优先：尝试提取 Markdown 代码块中的 JSON
        json_block = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', clean_text, re.DOTALL)
        if json_block:
            candidate = json_block.group(1)
        else:
            # 2. 兜底：利用堆栈匹配寻找最外层的合法 JSON 对象
            # 这能解决 "Here is the json: { ... }" 这种混合文本的情况
            candidate = ""
            stack = 0
            start_idx = -1
            
            for i, char in enumerate(clean_text):
                if char == '{':
                    if stack == 0:
                        start_idx = i
                    stack += 1
                elif char == '}':
                    stack -= 1
                    if stack == 0 and start_idx != -1:
                        # 找到闭合的 JSON 对象
                        candidate = clean_text[start_idx : i+1]
                        break 
            
            if not candidate:
                candidate = clean_text # 如果没找到结构，尝试解析整个文本

        # 3. 验证与修补
        try:
            schema = json.loads(candidate)
            
            # 确保基本结构完整
            if not isinstance(schema, dict):
                raise ValueError("Parsed JSON is not an object")
            
            if "type" not in schema:
                schema["type"] = "object"
            if "properties" not in schema:
                schema["properties"] = {}
            
            # 修正一些常见的数据类型错误
            for prop_name, prop_val in schema.get("properties", {}).items():
                # 确保 enum 是列表
                if "enum" in prop_val and not isinstance(prop_val["enum"], list):
                    del prop_val["enum"]
                
            return json.dumps(schema, indent=2)
            
        except Exception as e:
            print(f"⚠️ JSON Parse Failed. Raw snippet: {clean_text[:100]}... Error: {e}")
            # 返回空 Schema 防止前端崩溃
            return json.dumps({"type": "object", "properties": {}}, indent=2)

    def _extract_code_block(self, text: str, mode: str, target_lang: str = "Python") -> Dict[str, Any]:
        """
        [强健的提取器 v3]
        使用 target_lang 进行定向提取，彻底解决 Script 和 JSON 混淆的问题。
        """
        clean_text = self._clean_response(text)
        
        # 提取所有 markdown 代码块: [(lang, content), (lang, content)...]
        blocks = re.findall(r'```(\w*)\n(.*?)```', clean_text, re.DOTALL)
        
        main_code = ""
        params_schema = "{}"
        explanation = re.sub(r'```.*?```', '', clean_text, flags=re.DOTALL).strip()
        explanation = explanation[:300] + "..." if len(explanation) > 300 else explanation

        if not blocks:
            # 兜底：如果没有 Markdown 标记，但文本看起来像代码
            print("⚠️ No code blocks found.")
            if mode != "TOOL" and ("process " in clean_text or "workflow {" in clean_text):
                 return {
                    "main_nf": clean_text,
                    "params_schema": self._generate_params_schema(clean_text),
                    "description": "Raw extraction",
                    "explanation": "No markdown blocks found."
                }
            return self._error_fallback(clean_text, "No markdown code blocks (```) found.")

        # === 策略：先找 JSON Schema，再找目标语言脚本 ===

        # 1. 寻找 Parameters JSON Schema
        for lang, content in blocks:
            l = lang.strip().lower()
            c = content.strip()
            # 语言标记是 json，或者内容看起来非常像 JSON Schema (包含 "properties")
            if l == 'json' or (c.startswith('{') and '"properties"' in c):
                try:
                    # 验证是否为合法 JSON
                    json.loads(c)
                    params_schema = c
                    break # 找到 Schema，停止寻找
                except:
                    continue

        # 2. 寻找 Main Script (根据 target_lang)
        target_tag = target_lang.lower() # r, python, perl...
        
        # 2a. 优先匹配准确的语言标签 (e.g., ```r)
        for lang, content in blocks:
            l = lang.strip().lower()
            if l == target_tag:
                main_code = content
                break
        
        # 2b. 如果没找到准确标签，尝试找通用脚本标签 (非 JSON)
        if not main_code:
            supported_langs = ['python', 'r', 'perl', 'bash', 'sh', 'groovy', 'nextflow']
            for lang, content in blocks:
                l = lang.strip().lower()
                c = content.strip()
                # 如果是支持的语言，且内容不等于刚才找到的 schema
                if l in supported_langs and c != params_schema:
                    main_code = content
                    break
        
        # 2c. 终极兜底：找第一个不是 JSON Schema 的块
        if not main_code:
            for lang, content in blocks:
                c = content.strip()
                if c != params_schema and not (c.startswith('{') and '"properties"' in c):
                    main_code = content
                    break

        # 3. 后处理：Pipeline 模式如果没有 Schema，尝试反向生成
        if mode != "TOOL" and params_schema == "{}":
             params_schema = self._generate_params_schema(main_code)

        if not main_code:
            return self._error_fallback(clean_text, f"Could not find a valid {target_lang} script block.")

        return {
            "main_nf": main_code,
            "params_schema": params_schema,
            "description": f"Generated {target_lang} Script",
            "explanation": explanation or "Code generated successfully."
        }

    def _error_fallback(self, raw_text: str, error_msg: str) -> Dict[str, Any]:
        safe_text = raw_text.replace("*/", "* /")
        return {
            "main_nf": f"# GENERATION ERROR\n# {error_msg}\n\n'''\n{safe_text}\n'''",
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
        if mode in ["PIPELINE", "MODULE"]:
            if re.search(r'output\s*:[^}]*publishDir', code, re.DOTALL):
                errors.append("SYNTAX ERROR: `publishDir` must be placed BEFORE `input:` or `output:` blocks.")
            if re.search(r'def\s+\w+\s*\(.*?\)\s*\{\s*process\s+', code, re.DOTALL):
                errors.append("DSL2 VIOLATION: Do NOT wrap `process` definitions inside Groovy functions.")
        return errors

    def generate_workflow(self, messages: List[Dict[str, str]], mode: str = "MODULE", available_modules: str = "") -> Dict[str, Any]:
        """Agentic Workflow"""
        
        # 1. 动态检测用户想要的语言
        target_lang = "Python" # 默认
        if mode == "TOOL":
            target_lang = self._detect_language_request(messages)
            print(f"🎯 Detected Intent Language: {target_lang}")
        elif mode == "MODULE" or mode == "PIPELINE":
            target_lang = "Nextflow"

        print(f"🚀 Step 1: Drafting code for mode: {mode} ({target_lang})...")
        draft_response = self._generate_draft(messages, mode, available_modules, target_lang)
        
        if not draft_response:
             return self._error_fallback("", "LLM Connection Failed")

        # 2. 提取时传入 target_lang，确保提取准确
        current_data = self._extract_code_block(draft_response, mode, target_lang)
        
        if current_data["main_nf"].startswith("# GENERATION ERROR"):
            return current_data

        # === Step 2: Refine Loop ===
        # 只有 Nextflow 代码需要静态检查，工具脚本通常靠 LLM 自己保证
        if mode in ["PIPELINE", "MODULE"]:
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
                refine_prompt += f"\nPlease rewrite the code in a ```{target_lang.lower()} block."
                
                # Refine 也要传入 target_lang
                current_data = self._refine_code(current_data, refine_prompt, mode, target_lang)

        return current_data

    def _generate_draft(self, messages: List[Dict[str, str]], mode: str, available_modules: str, target_lang: str = "Python") -> str:
        backticks = "`" * 3
        
        base_prompt = """
You are an expert Bioinformatics Developer.
"""
        
        if mode == "TOOL":
            # 动态生成 Prompt，防止 Python 干扰 R
            lang_instruction = ""
            if target_lang == "R":
                lang_instruction = f"""
- TARGET LANGUAGE: R
- LIBRARY: Use `optparse` for argument parsing.
- STRUCTURE Example:
{backticks}r
library(optparse)
option_list = list(
  make_option(c("-i", "--input"), type="character", default=NULL, help="input file", metavar="character"),
  make_option(c("-o", "--output"), type="character", default="out.pdf", help="output file", metavar="character")
)
opt_parser = OptionParser(option_list=option_list)
opt = parse_args(opt_parser)
# Logic...
{backticks}
"""
            else: # Python
                lang_instruction = f"""
- TARGET LANGUAGE: Python
- LIBRARY: Use `argparse`.
- STRUCTURE Example:
{backticks}python
import argparse
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', required=True)
    args = parser.parse_args()
if __name__ == '__main__':
    main()
{backticks}
"""

            mode_instruction = f"""
MODE: TOOL (Standalone Script)
TASK: Create a production-grade {target_lang} script.

CRITICAL OUTPUT RULES:
1. You MUST output the script inside a ```{target_lang.lower()}``` block.
2. You MUST output the JSON Schema for parameters inside a separate ```json``` block.

{lang_instruction}
"""
        elif mode == "MODULE":
            template = backticks + "groovy\nparams.outdir = './results'\n\nprocess NAME {\n    tag \"$meta.id\"\n    label 'process_medium'\n    publishDir \"${params.outdir}/name\", mode: 'copy'\n\n    input:\n    tuple val(meta), path(reads)\n    path index \n\n    output:\n    tuple val(meta), path(\"*.bam\"), emit: bam\n\n    script:\n    \"\"\"\n    tool_command --threads ${task.cpus} input output\n    \"\"\"\n}\n" + backticks
            mode_instruction = f"MODE: MODULE (Nextflow Process).\nCreate a single `process`. Structure:\n{template}"
        else: 
            code_block = backticks + "groovy\n// Define default parameters\nparams.input = null\nparams.outdir = './results'\n\nChannel.fromPath(params.input)\n    .splitCsv(header:true)\n    .map{ row ->\n        def meta = [id: row.sample_id]\n        def reads = row.r2_path ? [file(row.r1_path), file(row.r2_path)] : [file(row.r1_path)]\n        return tuple(meta, reads)\n    }\n    .set { ch_input }\n" + backticks
            mode_instruction = f"MODE: PIPELINE (Nextflow Workflow).\nStart with standard input logic:\n{code_block}\nAvailable Modules:\n{available_modules}"

        system_prompt = base_prompt + "\n" + mode_instruction
        msgs = [{"role": "system", "content": system_prompt}] + messages
        return self._call_llm(msgs)

    def _refine_code(self, current_data: Dict[str, Any], instructions: str, mode: str, target_lang: str) -> Dict[str, Any]:
        code_to_check = current_data["main_nf"]
        backticks = "`" * 3
        
        refine_prompt = f"""
{instructions}

CURRENT CODE:
{backticks}
{code_to_check}
{backticks}

Return the FIXED code in a ```{target_lang.lower()}``` block.
"""
        msgs = [{"role": "user", "content": refine_prompt}]
        response_text = self._call_llm(msgs)
        return self._extract_code_block(response_text, mode, target_lang)

llm_client = LLMClient()