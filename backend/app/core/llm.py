import os
import json
import re
from openai import OpenAI
import instructor
from pydantic import BaseModel, Field
from typing import Dict, Any, Optional, List

# ==========================================
# 1. Pydantic Models (定义严格的输出结构)
# ==========================================

class ParameterProperty(BaseModel):
    type: str = Field(description="Parameter type (e.g., string, integer, number, boolean)")
    title: Optional[str] = Field(None, description="A human-readable title for the parameter")
    description: Optional[str] = Field(None, description="Description of what the parameter does")
    default: Optional[Any] = Field(None, description="Default value if any")
    enum: Optional[List[Any]] = Field(None, description="List of allowed values if it is a choice/enum")

class ExtractedSchema(BaseModel):
    type: str = Field(default="object")
    properties: Dict[str, ParameterProperty] = Field(default_factory=dict, description="Dictionary of extracted parameters")
    required: Optional[List[str]] = Field(default_factory=list, description="List of required parameter names")

class WorkflowDraft(BaseModel):
    main_nf: str = Field(..., description="The complete, runnable source code (Python, R, or Nextflow). Do NOT wrap in markdown quotes.")
    params_schema: ExtractedSchema = Field(..., description="The JSON schema extracting the parameters from the code.")
    description: str = Field(..., description="Short title or description of the script")
    explanation: str = Field(..., description="Brief explanation of how the code works and what it does")

# ==========================================
# 2. LLM Client (基于 Instructor 驱动)
# ==========================================

class LLMClient:
    def __init__(self):
        self.provider = os.getenv("LLM_PROVIDER", "ollama")
        self.base_url = os.getenv("LLM_BASE_URL", "http://host.docker.internal:11434/v1")
        self.api_key = os.getenv("LLM_API_KEY", "ollama")
        # 兼容 GLM-4/5, Qwen2.5-Coder 等先进模型
        self.model = os.getenv("LLM_MODEL", "qwen2.5-coder:32b")
        
        print(f"🚀 LLM Client Initialized (Instructor Structured Mode): {self.model} @ {self.base_url}", flush=True)
        
        # 核心改动：使用 instructor 包装 OpenAI 客户端
        # Mode.JSON 兼容大部分现代大模型 (使用原生的 response_format={"type": "json_object"})
        self.raw_client = OpenAI(base_url=self.base_url, api_key=self.api_key)
        self.client = instructor.from_openai(self.raw_client, mode=instructor.Mode.JSON)

    def _log_interaction(self, title: str, input_msgs: Any, parsed_output: Any):
        """强制刷新到控制台的日志打印，方便 docker logs 追踪"""
        print(f"\n{'='*20} 📤 {title} - REQUEST {'='*20}", flush=True)
        if isinstance(input_msgs, list):
            for msg in input_msgs:
                print(f"[{msg.get('role', 'unknown').upper()}]:\n{msg.get('content', '')}\n", flush=True)
        else:
            print(input_msgs, flush=True)
            
        print(f"\n{'='*20} 📥 {title} - PARSED RESPONSE {'='*20}", flush=True)
        # 将 Pydantic 对象转回漂亮格式的 JSON 打印
        if hasattr(parsed_output, "model_dump_json"):
            print(parsed_output.model_dump_json(indent=2, exclude_none=True), flush=True)
        else:
            print(parsed_output, flush=True)
        print(f"{'='*60}\n", flush=True)

    def _clean_code(self, code: str) -> str:
        """清理大模型偶尔在代码字段首尾附带的 Markdown 标记"""
        if not code: return ""
        code = re.sub(r'^```\w*\n', '', code.strip())
        code = re.sub(r'\n```$', '', code.strip())
        return code.strip()

    def _detect_language_request(self, messages: List[Dict[str, str]]) -> str:
        content = " ".join([m.get("content", "").lower() for m in messages])
        if "r script" in content or "r脚本" in content or "r language" in content or "library(" in content:
            return "R"
        if "perl" in content:
            return "Perl"
        return "Python" # 默认

    def generate_schema_from_code(self, code: str, mode: str) -> str:
        """
        [独立功能] 从已有代码反向生成 JSON Schema。
        返回 Draft-07 JSON 字符串。
        """
        prompt = f"""
        You are a Data Extraction Agent.
        Analyze the following bioinformatics script ({mode} mode) and extract its input parameters.
        Map them accurately into the requested JSON Schema structure.
        
        CODE TO ANALYZE:
        ```
        {code}
        ```
        """
        messages = [{"role": "user", "content": prompt}]
        
        try:
            print(f"🔍 [LLM Schema Extractor] Extracting via {self.model}...", flush=True)
            
            # 直接要求返回 ExtractedSchema 对象，instructor 会自动处理重试和验证
            schema_obj: ExtractedSchema = self.client.chat.completions.create(
                model=self.model,
                response_model=ExtractedSchema,
                messages=messages,
                temperature=0.1,
                max_retries=3  # 如果模型输出错误，instructor 会自动报错给模型并要求重试 3 次
            )
            
            self._log_interaction("SCHEMA EXTRACTION", messages, schema_obj)
            return schema_obj.model_dump_json(exclude_none=True, indent=2)
            
        except Exception as e:
            print(f"❌ [LLM Schema Extractor] Error: {e}", flush=True)
            return json.dumps({"type": "object", "properties": {}}, indent=2)

    def _build_system_prompt(self, mode: str, target_lang: str, available_modules: str) -> str:
        """构建上下文提示词"""
        prompt = "You are an expert Bioinformatics Developer. Write clean, production-ready code.\n\n"
        
        if mode == "TOOL":
            if target_lang == "R":
                prompt += """MODE: TOOL (R Script)
                INSTRUCTION: Use `optparse` for arguments.
                EXAMPLE STRUCTURE:
                library(optparse)
                option_list = list(make_option(c("-i", "--input"), type="character", help="Input file"))
                opt = parse_args(OptionParser(option_list=option_list))
                """
            else:
                prompt += """MODE: TOOL (Python Script)
                INSTRUCTION: Use `argparse` for arguments.
                EXAMPLE STRUCTURE:
                import argparse
                parser = argparse.ArgumentParser(); parser.add_argument('--input'); args = parser.parse_args()
                """
        elif mode == "MODULE":
            prompt += "MODE: Nextflow Module. Create a single `process` block. Use `publishDir` to save outputs."
        else:
            prompt += f"MODE: Nextflow Pipeline. Connect processes in a `workflow` block. Available Modules:\n{available_modules}"
            
        return prompt

    def generate_workflow(self, messages: List[Dict[str, str]], mode: str = "MODULE", available_modules: str = "") -> Dict[str, Any]:
        """
        主入口：生成代码和 Schema (端到端结构化输出)
        """
        target_lang = "Python"
        if mode == "TOOL":
            target_lang = self._detect_language_request(messages)
        elif mode in ["MODULE", "PIPELINE"]:
            target_lang = "Nextflow"

        print(f"🎬 [LLM Generator] Starting Structured Task: {mode} ({target_lang})", flush=True)

        system_prompt = self._build_system_prompt(mode, target_lang, available_modules)
        full_messages = [{"role": "system", "content": system_prompt}] + messages

        try:
            # 核心黑科技：直接要求模型返回 WorkflowDraft 包含代码和Schema
            draft: WorkflowDraft = self.client.chat.completions.create(
                model=self.model,
                response_model=WorkflowDraft,
                messages=full_messages,
                temperature=0.1,
                max_retries=3 
            )
            
            self._log_interaction("WORKFLOW GENERATION", full_messages, draft)

            code = self._clean_code(draft.main_nf)
            schema_str = draft.params_schema.model_dump_json(exclude_none=True, indent=2)

            result = {
                "main_nf": code,
                "params_schema": schema_str,
                "description": draft.description,
                "explanation": draft.explanation
            }

            # 静态检查和修正 (针对 Nextflow 语法)
            if mode in ["PIPELINE", "MODULE"]:
                errors = self._static_analysis(code, mode)
                if errors:
                    print(f"⚠️ Static Analysis failed: {errors}. Attempting auto-fix...", flush=True)
                    result = self._refine_code_structured(result, "\n".join(errors), mode, target_lang)

            return result

        except Exception as e:
            print(f"❌ [LLM Generator] Workflow Generation Error: {e}", flush=True)
            return {
                "main_nf": f"# GENERATION ERROR: {str(e)}",
                "params_schema": "{}",
                "description": "Error",
                "explanation": str(e)
            }

    def _static_analysis(self, code: str, mode: str) -> List[str]:
        """简单的静态检查，发现严重语法错误"""
        errors = []
        if mode in ["PIPELINE", "MODULE"]:
            if re.search(r'output\s*:[^}]*publishDir', code, re.DOTALL):
                errors.append("Nextflow Syntax Error: `publishDir` must be defined BEFORE `input:` or `output:` blocks.")
        return errors

    def _refine_code_structured(self, current_data: Dict[str, Any], feedback: str, mode: str, target_lang: str) -> Dict[str, Any]:
        """使用结构化输出进行自我修正"""
        code = current_data["main_nf"]
        prompt = f"""
        The previous generated code had errors. Please FIX it based on the feedback.
        
        FEEDBACK:
        {feedback}
        
        ORIGINAL CODE:
        ```
        {code}
        ```
        
        Return the fully corrected WorkflowDraft.
        """
        try:
            print(f"🔄 [LLM Refiner] Refining code via instructor...", flush=True)
            draft: WorkflowDraft = self.client.chat.completions.create(
                model=self.model,
                response_model=WorkflowDraft,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.1,
                max_retries=2
            )
            
            self._log_interaction("WORKFLOW REFINE", prompt, draft)
            
            return {
                "main_nf": self._clean_code(draft.main_nf),
                "params_schema": draft.params_schema.model_dump_json(exclude_none=True, indent=2),
                "description": draft.description,
                "explanation": draft.explanation
            }
        except Exception as e:
            print(f"❌ [LLM Refiner] Error: {e}", flush=True)
            return current_data # 失败则返回原代码

llm_client = LLMClient()