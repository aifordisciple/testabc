import os
import json
import re
import ast
from openai import OpenAI
from typing import Dict, Any, Optional, List

class LLMClient:
    def __init__(self):
        self.provider = os.getenv("LLM_PROVIDER", "ollama")
        self.base_url = os.getenv("LLM_BASE_URL", "http://host.docker.internal:11434/v1")
        self.api_key = os.getenv("LLM_API_KEY", "ollama")
        # 推荐使用 qwen2.5-coder:32b 或 deepseek-r1
        self.model = os.getenv("LLM_MODEL", "qwen2.5-coder:32b")
        
        print(f"🚀 LLM Client Initialized: {self.model} @ {self.base_url}")
        
        self.client = OpenAI(
            base_url=self.base_url,
            api_key=self.api_key
        )

    def _clean_response(self, text: str) -> str:
        """清洗 DeepSeek/Qwen 的 <think> 标签及其他无关内容"""
        if not text: return ""
        text = re.sub(r'<think>.*?</think>', '', text, flags=re.DOTALL)
        text = re.sub(r'<think>.*', '', text, flags=re.DOTALL) # 处理截断的 think
        return text.strip()

    def _repair_json(self, json_str: str) -> str:
        """
        [JSON 修复引擎 V2]
        尝试修复大模型输出的非标准 JSON 格式。
        """
        if not json_str: return "{}"
        
        try:
            # 1. 移除 Markdown 代码块标记
            json_str = re.sub(r'^```\w*\s*', '', json_str.strip())
            json_str = re.sub(r'\s*```$', '', json_str.strip())

            # 2. 移除注释 (// 和 /* */)
            json_str = re.sub(r'//.*', '', json_str)
            json_str = re.sub(r'/\*.*?\*/', '', json_str, flags=re.DOTALL)

            # 3. 修复尾随逗号 (Trailing Commas) -> {"a": 1,} -> {"a": 1}
            json_str = re.sub(r',(\s*[}\]])', r'\1', json_str)

            # 4. 替换 Python 特有的 Boolean/None
            # 注意：这可能会误伤字符串中的内容，但在解析 Schema 场景下风险可控
            json_str = json_str.replace(": True", ": true").replace(": False", ": false").replace(": None", ": null")
            json_str = json_str.replace(":True", ": true").replace(":False", ": false").replace(":None", ": null")

            return json_str.strip()
        except Exception as e:
            print(f"⚠️ [JSON Repair] Exception: {e}")
            return json_str

    def _robust_json_parse(self, text: str) -> Dict[str, Any]:
        """
        [三级解析策略]
        1. 直接解析
        2. 修复后解析
        3. AST literal_eval (容忍单引号)
        """
        # 尝试提取最外层 {}
        match = re.search(r'(\{.*\})', text, re.DOTALL)
        if match:
            text = match.group(1)

        # 策略 1: 直接解析
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            pass

        # 策略 2: 修复后解析
        try:
            repaired = self._repair_json(text)
            return json.loads(repaired)
        except json.JSONDecodeError:
            pass

        # 策略 3: Python AST 解析 (处理单引号 key: {'a': 1})
        try:
            # AST 解析可以将 Python 字典字符串转为对象，然后我们再 dump 成标准 JSON
            obj = ast.literal_eval(text)
            if isinstance(obj, dict):
                return obj
        except:
            pass

        print(f"❌ [JSON Parse] All strategies failed for: {text[:100]}...")
        return {}

    def _call_llm(self, messages: List[Dict[str, str]], json_mode: bool = False) -> str:
        """
        统一调用接口，集成日志和 JSON Mode
        """
        try:
            print(f"\n{'='*20} 📤 LLM REQUEST ({self.model}) {'='*20}")
            print(json.dumps(messages, indent=2, ensure_ascii=False))
            print(f"{'='*60}")

            kwargs = {
                "model": self.model,
                "messages": messages,
                "temperature": 0.1, # 保持低温以获得稳定输出
                "max_tokens": 8192
            }

            # 尝试开启 JSON Mode (兼容 OpenAI API 格式)
            if json_mode:
                kwargs["response_format"] = {"type": "json_object"}
                print("💡 JSON Mode: ENABLED")

            response = self.client.chat.completions.create(**kwargs)
            content = response.choices[0].message.content

            print(f"\n{'='*20} 📥 LLM RESPONSE {'='*20}")
            print(content)
            print(f"{'='*60}\n")

            return content

        except Exception as e:
            print(f"❌ LLM API Error: {e}")
            return ""

    def generate_schema_from_code(self, code: str, mode: str) -> str:
        """
        [专门用途] 从代码反向生成 JSON Schema。
        使用了 Few-Shot Prompting 以提高准确率。
        """
        # 构建 Few-Shot Prompt
        prompt = f"""
You are a Parser Agent. Analyze the code and extract input parameters into a **Draft-07 JSON Schema**.

### EXAMPLES

**Input (Python):**
parser.add_argument('--input', type=str, required=True, help="Input file")
parser.add_argument('--threads', type=int, default=4)

**Output (JSON):**
{{
  "type": "object",
  "properties": {{
    "input": {{ "type": "string", "description": "Input file" }},
    "threads": {{ "type": "integer", "default": 4 }}
  }},
  "required": ["input"]
}}

**Input (R):**
make_option(c("-f", "--file"), type="character", default=NULL)
make_option(c("--verbose"), action="store_true", default=FALSE)

**Output (JSON):**
{{
  "type": "object",
  "properties": {{
    "file": {{ "type": "string", "default": null }},
    "verbose": {{ "type": "boolean", "default": false }}
  }}
}}

### YOUR TASK
Extract parameters from the following code.
Return ONLY valid JSON.

Code:
```
{code}
```
"""
        messages = [{"role": "user", "content": prompt}]
        
        # 强制启用 JSON Mode
        response = self._call_llm(messages, json_mode=True)
        cleaned = self._clean_response(response)
        
        parsed_obj = self._robust_json_parse(cleaned)
        
        # 兜底：如果解析失败或为空，返回默认
        if not parsed_obj or "properties" not in parsed_obj:
            print("⚠️ Schema extraction failed, returning default.")
            return json.dumps({
                "type": "object", 
                "properties": {
                    "input": {"type": "string", "title": "Input File (Auto-detected)"}
                }
            }, indent=2)
            
        return json.dumps(parsed_obj, indent=2)

    def _extract_code_block(self, text: str, mode: str, target_lang: str = "Python") -> Dict[str, Any]:
        """
        [提取与后处理]
        从 LLM 回复中提取代码块和 JSON Schema。如果 Schema 缺失，自动调用生成器补充。
        """
        clean_text = self._clean_response(text)
        
        # 1. 提取所有 Markdown 代码块
        # 匹配 ```lang ... ```
        blocks = re.findall(r'```(\w*)\n(.*?)```', clean_text, re.DOTALL)
        
        main_code = ""
        params_schema_str = ""
        
        # 2. 遍历块进行分类
        target_lang_lower = target_lang.lower()
        
        for lang, content in blocks:
            lang = lang.strip().lower()
            content = content.strip()
            
            # 判断是否为 JSON Schema
            if lang == 'json' or (content.startswith('{') and '"properties"' in content):
                # 简单验证是否看起来像 Schema
                if '"type":' in content or '"properties":' in content:
                    params_schema_str = content
                    continue
            
            # 判断是否为目标代码
            # 优先匹配准确的语言标签
            if lang == target_lang_lower:
                main_code = content
            # 其次匹配常见的脚本语言 (如果还没找到)
            elif not main_code and lang in ['python', 'r', 'perl', 'bash', 'sh', 'groovy', 'nextflow']:
                main_code = content
            # 最后，如果没有语言标签，但内容不像 JSON，也可能是代码
            elif not main_code and not lang and not content.startswith('{'):
                main_code = content

        # 3. 兜底策略：如果没找到代码块，尝试直接从文本中提取
        if not main_code and not blocks:
            # 假设整个文本就是代码 (如果是 Pipeline 模式)
            if mode != "TOOL":
                main_code = clean_text
            else:
                return self._error_fallback(clean_text, f"No ```{target_lang}``` code block found.")

        # 4. Schema 自动补全/修复
        # 如果没有提取到 Schema，或者提取到的无法解析，则调用专门的生成器
        valid_schema = False
        if params_schema_str:
            parsed = self._robust_json_parse(params_schema_str)
            if parsed and "properties" in parsed:
                params_schema_str = json.dumps(parsed, indent=2)
                valid_schema = True
        
        if not valid_schema and main_code:
            print(f"🔄 Missing or invalid schema. Invoking specialized schema generator...")
            params_schema_str = self.generate_schema_from_code(main_code, mode)

        return {
            "main_nf": main_code,
            "params_schema": params_schema_str,
            "description": f"Generated {target_lang} Script",
            "explanation": clean_text[:200] + "..." # 简略说明
        }

    def _detect_language_request(self, messages: List[Dict[str, str]]) -> str:
        content = " ".join([m.get("content", "").lower() for m in messages])
        if "r script" in content or "r脚本" in content or "r language" in content or "library(" in content:
            return "R"
        if "perl" in content:
            return "Perl"
        return "Python" # Default

    def _error_fallback(self, raw_text: str, error_msg: str) -> Dict[str, Any]:
        return {
            "main_nf": f"# GENERATION ERROR: {error_msg}\n\n'''\n{raw_text}\n'''",
            "params_schema": "{}",
            "description": "Error",
            "explanation": error_msg
        }

    def _static_analysis(self, code: str, mode: str) -> List[str]:
        """简单的静态检查，发现严重语法错误"""
        errors = []
        if mode in ["PIPELINE", "MODULE"]:
            if "process " in code and "workflow " not in code and mode == "PIPELINE":
                # 这是一个 Warning，不算 Error
                pass
            if re.search(r'output\s*:[^}]*publishDir', code, re.DOTALL):
                errors.append("Nextflow Syntax Error: `publishDir` must be defined BEFORE `input:` or `output:` blocks.")
        return errors

    def _generate_draft(self, messages: List[Dict[str, str]], mode: str, available_modules: str, target_lang: str) -> str:
        """根据模式构建 System Prompt 并请求初稿"""
        
        # 基础设定
        system_prompt = "You are an expert Bioinformatics Developer. Write clean, production-ready code."
        
        if mode == "TOOL":
            if target_lang == "R":
                template = """
library(optparse)
option_list = list(
    make_option(c("-i", "--input"), type="character", help="Input file"),
    make_option(c("-o", "--output"), type="character", default="result.txt", help="Output file")
)
opt = parse_args(OptionParser(option_list=option_list))
# ... logic ...
"""
                instruct = f"Write an R script using `optparse`. Follow this structure:\n```{template}```"
            else:
                template = """
import argparse
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', required=True, help="Input file")
    parser.add_argument('--output', default="result.txt", help="Output file")
    args = parser.parse_args()
    # ... logic ...
if __name__ == "__main__":
    main()
"""
                instruct = f"Write a Python script using `argparse`. Follow this structure:\n```{template}```"
                
            system_prompt += f"\n\nMODE: TOOL ({target_lang})\n{instruct}\n\nIMPORTANT: Output the script in a ```{target_lang.lower()}``` block."

        elif mode == "MODULE":
            system_prompt += "\n\nMODE: Nextflow Module.\nWrite a single `process` block. Use `publishDir` to save outputs."
            
        elif mode == "PIPELINE":
            system_prompt += f"\n\nMODE: Nextflow Pipeline.\nConnect processes in a `workflow` block.\nAvailable Modules Context:\n{available_modules}"

        # 组合消息
        full_messages = [{"role": "system", "content": system_prompt}] + messages
        return self._call_llm(full_messages)

    def _refine_code(self, current_data: Dict[str, Any], feedback: str, mode: str, target_lang: str) -> Dict[str, Any]:
        """自我修正循环"""
        code = current_data["main_nf"]
        prompt = f"""
The previous code had issues. Please FIX it based on the feedback.

FEEDBACK:
{feedback}

ORIGINAL CODE:
{code}


Return the full FIXED code in a ```{target_lang.lower()}``` block.
"""
        messages = [{"role": "user", "content": prompt}]
        response = self._call_llm(messages)
        return self._extract_code_block(response, mode, target_lang)

    def generate_workflow(self, messages: List[Dict[str, str]], mode: str = "MODULE", available_modules: str = "") -> Dict[str, Any]:
        """
        主入口：生成工作流或脚本
        """
        # 1. 确定目标语言
        target_lang = "Python"
        if mode == "TOOL":
            target_lang = self._detect_language_request(messages)
        elif mode in ["MODULE", "PIPELINE"]:
            target_lang = "Nextflow"

        print(f"🎬 Starting Generation Task: {mode} ({target_lang})")

        # 2. 生成初稿
        draft_text = self._generate_draft(messages, mode, available_modules, target_lang)
        if not draft_text:
            return self._error_fallback("", "LLM Empty Response")

        # 3. 提取代码和参数
        data = self._extract_code_block(draft_text, mode, target_lang)
        
        # 4. (可选) 静态检查与自我修正循环
        # 对于 Pipeline/Module，进行简单的语法检查
        if mode in ["PIPELINE", "MODULE"]:
            errors = self._static_analysis(data["main_nf"], mode)
            if errors:
                print(f"⚠️ Static Analysis failed: {errors}. Attempting auto-fix...")
                data = self._refine_code(data, "\n".join(errors), mode, target_lang)

        return data

llm_client = LLMClient()