# ==========================================
# 统一 LLM 客户端模块
# 提供单例模式的 LLM、Embedding、Instructor 客户端
# ==========================================

import os
import logging
from typing import Dict, Any, Optional, List
from openai import OpenAI, AsyncOpenAI
import instructor
from langchain_openai import ChatOpenAI
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

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
# 2. 统一配置类
# ==========================================

class LLMConfig:
    """统一配置管理，从环境变量读取"""
    
    _instance = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance
    
    def __init__(self):
        if self._initialized:
            return
        self._initialized = True
        
        # LLM 配置
        self.provider = os.getenv("LLM_PROVIDER", "ollama")
        self.base_url = os.getenv("LLM_BASE_URL", "http://host.docker.internal:11434/v1")
        self.api_key = os.getenv("LLM_API_KEY", "ollama")
        self.model = os.getenv("LLM_MODEL", "qwen2.5-coder:32b")  # 统一默认模型
        
        # Embedding 配置
        self.embed_base_url = os.getenv("EMBED_BASE_URL", "http://host.docker.internal:11434/v1")
        self.embed_api_key = os.getenv("EMBED_API_KEY", "ollama")
        self.embed_model = os.getenv("EMBED_MODEL", "bge-m3")
        
        logger.info(f"LLM Config initialized: model={self.model}, base_url={self.base_url}")
    
    @property
    def llm_config_dict(self) -> Dict[str, Any]:
        return {
            "model": self.model,
            "base_url": self.base_url,
            "api_key": self.api_key,
            "temperature": 0.1
        }

# 获取配置单例
def get_llm_config() -> LLMConfig:
    return LLMConfig()

# ==========================================
# 3. 统一 LLM 客户端 (单例模式)
# ==========================================

class LLMClient:
    """
    统一的 LLM 客户端单例
    提供: ChatOpenAI, OpenAI, Instructor, AsyncOpenAI 客户端
    """
    _instance = None
    _initialized = False
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance
    
    def __init__(self):
        if self._initialized:
            return
        self._initialized = True
        
        config = get_llm_config()
        
        # LangChain ChatOpenAI (用于 agent.py, react_agent.py)
        self.chat = ChatOpenAI(
            model=config.model,
            base_url=config.base_url,
            api_key=config.api_key,
            temperature=0.1
        )
        
        # 原始 OpenAI 客户端 (用于 knowledge_service, workflow_matcher)
        self.raw_client = OpenAI(
            base_url=config.base_url,
            api_key=config.api_key
        )
        
        # Instructor 客户端 (用于结构化输出)
        self.instructor_client = instructor.from_openai(
            self.raw_client,
            mode=instructor.Mode.JSON
        )
        
        # Async OpenAI 客户端 (用于 llm_service)
        self.async_client = AsyncOpenAI(
            base_url=config.base_url,
            api_key=config.api_key
        )
        
        # Embedding 客户端
        self.embed_client = OpenAI(
            base_url=config.embed_base_url,
            api_key=config.embed_api_key
        )
        
        # 保存配置引用
        self.config = config
        
        logger.info(f"LLM Client initialized: model={config.model}, embed_model={config.embed_model}")
    
    def get_embedding(self, text: str) -> List[float]:
        """获取文本嵌入向量"""
        response = self.embed_client.embeddings.create(
            input=text.replace("\n", " "),
            model=self.config.embed_model
        )
        return response.data[0].embedding
    
    def chat_with_structure(self, response_model: BaseModel, messages: List[Dict[str, str]], **kwargs) -> BaseModel:
        """使用 Instructor 进行结构化输出"""
        return self.instructor_client.chat.completions.create(
            model=self.config.model,
            messages=messages,
            response_model=response_model,
            **kwargs
        )

# 获取单例
def get_llm_client() -> LLMClient:
    """获取 LLM 客户端单例"""
    return LLMClient()

# 导出便捷访问
llm_client = LLMClient()  # 模块级单例

# ==========================================
# 4. 向后兼容的导出
# ==========================================

# 保留原有的类名导出，保持向后兼容
ParameterProperty = ParameterProperty
ExtractedSchema = ExtractedSchema
WorkflowDraft = WorkflowDraft
LLMClient = LLMClient
llm_client = llm_client
