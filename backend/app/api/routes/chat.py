from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from app.schemas.chat import ChatRequest
from app.services.llm_service import llm_service
from app.api import deps
from app.models.user import User

router = APIRouter()

@router.post("/completions")
async def chat_completions(
    request: ChatRequest,
    current_user: User = Depends(deps.get_current_user)  # 添加鉴权，只有登录用户能用
):
    """
    与 AI 进行流式对话。
    需要 Authentication Token。
    """
    # 将 Pydantic 模型转换为 OpenAI SDK 需要的 list[dict] 格式
    messages_dict = [msg.model_dump() for msg in request.messages]
    
    return StreamingResponse(
        llm_service.chat_stream(
            messages=messages_dict,
            model=request.model,
            temperature=request.temperature
        ),
        media_type="text/event-stream"
    )