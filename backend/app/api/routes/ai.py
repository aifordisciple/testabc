from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import uuid

from app.core.db import get_session
from app.api.deps import get_current_user
from app.models.user import User, Project
from app.models.bio import WorkflowTemplate
from app.core.llm import llm_client

# 引入刚刚写的沙箱服务
from app.services.sandbox import sandbox_service

router = APIRouter()

# ================================
# 1. 结构与模型定义 (保留你的原有结构)
# ================================
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

class ParseParamsRequest(BaseModel):
    code: str
    mode: str = "TOOL" # PIPELINE / TOOL


# ================================
# 2. 代码生成端点 (恢复你原有的丰富逻辑)
# ================================
@router.post("/generate", response_model=GenerateResponse)
async def generate_workflow_code(
    payload: GenerateRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """
    使用 LLM 生成 Nextflow/Tool 代码，支持上下文。
    """
    conversation = [m.model_dump() for m in payload.messages]
    
    # 恢复：上下文代码注入
    if payload.current_code and len(conversation) > 0:
        last_msg = conversation[-1]
        if last_msg['role'] == 'user':
            last_msg['content'] += f"\n\n[Current Code Context]:\n{payload.current_code}"

    # 恢复：Pipeline 模式下获取现有模块
    available_modules_str = ""
    if payload.mode == "PIPELINE":
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


# ================================
# 3. 代码反向解析接口 (恢复)
# ================================
@router.post("/parse_params")
async def parse_params(
    payload: ParseParamsRequest,
    current_user: User = Depends(get_current_user)
):
    """
    分析提交的代码，反向提取参数并生成 JSON Schema
    """
    if not payload.code.strip():
        raise HTTPException(status_code=400, detail="Code is empty")
        
    try:
        # 调用 llm.py 中的新方法 (现在由 instructor 驱动)
        schema_str = llm_client.generate_schema_from_code(payload.code, payload.mode)
        return {"params_schema": schema_str}
    except Exception as e:
        print(f"Error in parse_params: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ================================
# 4. [新增] 安全沙箱执行端点
# ================================
class ExecuteRequest(BaseModel):
    code: str

@router.post("/projects/{project_id}/sandbox/execute")
def execute_sandbox_code(
    project_id: uuid.UUID,
    payload: ExecuteRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """
    在安全的 Docker 沙箱中执行 Python 代码。
    专门供 Bio-Copilot 代理在分析数据时调用。
    """
    # 验证项目权限
    project = session.get(Project, project_id)
    if not project or project.owner_id != current_user.id:
        raise HTTPException(status_code=404, detail="Project not found or permission denied.")
        
    if not payload.code.strip():
        raise HTTPException(status_code=400, detail="Code cannot be empty.")

    # 注入隐藏的引导代码，帮助模型更容易地找到项目数据
    setup_code = """import os
import sys
import pandas as pd
import warnings
warnings.filterwarnings('ignore')

# Set working directory contexts
DATA_DIR = '/data'      # Project files (Read-Only)
WORK_DIR = '/workspace' # Output files (Read-Write)
os.chdir(WORK_DIR)

"""
    # 拼接引导代码和 AI 生成的实际代码
    final_code = setup_code + payload.code

    try:
        # 执行代码
        result = sandbox_service.execute_python(
            project_id=str(project_id),
            code=final_code,
            timeout=60 # 设置 60 秒超时
        )
        return result
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Sandbox Execution Error: {str(e)}")

# 👇 追加导入 (放在文件顶部也可以，但不覆盖原有代码)
from app.core.agent import run_copilot_agent

class CopilotChatRequest(BaseModel):
    messages: List[Dict[str, str]]

@router.post("/projects/{project_id}/copilot/chat")
def chat_with_copilot(
    project_id: uuid.UUID,
    payload: CopilotChatRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """
    Bio-Copilot 会话接口。
    触发 LangGraph 代理，自主分析需求、生成代码并在沙箱中执行出图。
    """
    project = session.get(Project, project_id)
    if not project or project.owner_id != current_user.id:
        raise HTTPException(status_code=404, detail="Project not found")

    try:
        # 调用 LangGraph Agent 大脑
        result = run_copilot_agent(str(project_id), payload.messages)
        return result
    except Exception as e:
        print(f"Copilot Error: {str(e)}", flush=True)
        raise HTTPException(status_code=500, detail=str(e))