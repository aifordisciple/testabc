from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from pydantic import BaseModel
from typing import Optional, List, Dict

from app.core.db import get_session
from app.api.deps import get_current_user
from app.models.user import User
from app.models.bio import WorkflowTemplate
from app.core.llm import llm_client

router = APIRouter()

class ChatMessage(BaseModel):
    role: str 
    content: str

class GenerateRequest(BaseModel):
    messages: List[ChatMessage]
    mode: str = "MODULE" 
    current_code: Optional[str] = None

class GenerateResponse(BaseModel):
    main_nf: str
    params_schema: str
    description: str
    explanation: str

@router.post("/generate", response_model=GenerateResponse)
async def generate_workflow_code(
    payload: GenerateRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """
    使用 LLM 生成 Nextflow 代码，支持上下文。
    """
    
    conversation = [m.model_dump() for m in payload.messages]
    
    if payload.current_code and len(conversation) > 0:
        last_msg = conversation[-1]
        if last_msg['role'] == 'user':
            last_msg['content'] += f"\n\n[Current Code Context]:\n{payload.current_code}"

    # Pipeline 模式下获取现有模块
    available_modules_str = ""
    if payload.mode == "PIPELINE":
        # ⚠️ 修复：使用 workflow_type 而不是 type
        modules = session.exec(select(WorkflowTemplate).where(WorkflowTemplate.workflow_type == "MODULE")).all()
        if modules:
            module_list = []
            for m in modules:
                module_list.append(f"- Module Name: {m.name}\n  Description: {m.description}")
            available_modules_str = "\n".join(module_list)
        else:
            available_modules_str = "No existing modules found in database."

    try:
        result = llm_client.generate_workflow(
            messages=conversation,
            mode=payload.mode,
            available_modules=available_modules_str
        )
        return GenerateResponse(**result)
    except Exception as e:
        print(f"AI Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))