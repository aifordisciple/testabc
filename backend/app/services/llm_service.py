from openai import AsyncOpenAI
from typing import AsyncGenerator, List, Dict, Any
from app.core.config import settings

class LLMService:
    def __init__(self):
        # 初始化异步客户端
        self.client = AsyncOpenAI(
            base_url=settings.LLM_BASE_URL,
            api_key=settings.LLM_API_KEY
        )
        self.default_model = settings.LLM_MODEL
        self.default_temp = settings.LLM_TEMPERATURE

    async def chat_stream(
        self, 
        messages: List[Dict[str, str]], 
        model: str = None,
        temperature: float = None
    ) -> AsyncGenerator[str, None]:
        """
        生成流式对话响应
        """
        target_model = model or self.default_model
        target_temp = temperature if temperature is not None else self.default_temp
        
        try:
            stream = await self.client.chat.completions.create(
                model=target_model,
                messages=messages,
                stream=True,
                temperature=target_temp,
                max_tokens=4096  # 防止生成过长
            )

            async for chunk in stream:
                content = chunk.choices[0].delta.content
                if content:
                    yield content

        except Exception as e:
            # 捕获连接错误（如 Ollama 未启动）
            yield f"\n[System Error]: Failed to connect to LLM provider. Info: {str(e)}"

# 单例模式导出
llm_service = LLMService()