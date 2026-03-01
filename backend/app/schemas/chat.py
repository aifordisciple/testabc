from pydantic import BaseModel
from typing import List, Optional, Literal

class ChatMessage(BaseModel):
    role: Literal["user", "system", "assistant"]
    content: str

class ChatRequest(BaseModel):
    messages: List[ChatMessage]
    model: Optional[str] = None  # 允许前端临时覆盖模型
    temperature: Optional[float] = None

# 用于非流式响应（如果将来需要）
class ChatResponse(BaseModel):
    role: str
    content: str