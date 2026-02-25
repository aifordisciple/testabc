import uuid
import json
import os
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from pydantic import BaseModel

from app.core.db import get_session
from app.api.deps import get_current_user
from app.models.user import User, Project, Analysis, CopilotMessage, File, ProjectFileLink
from app.models.bio import WorkflowTemplate
from app.core.agent import run_copilot_planner
from app.services.workflow_service import workflow_service

router = APIRouter()

class ChatRequest(BaseModel):
    message: str
    session_id: str = "default"  # 👇 新增会话ID

class ExecutePlanRequest(BaseModel):
    plan_data: dict
    session_id: str = "default"  # 👇 新增会话ID

# 👇 新增接口：获取项目下所有的会话列表
@router.get("/projects/{project_id}/chat/sessions")
def get_chat_sessions(project_id: uuid.UUID, session: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    project = session.get(Project, project_id)
    if not project or project.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Permission denied")
        
    records = session.exec(select(CopilotMessage.session_id).where(CopilotMessage.project_id == project_id).distinct()).all()
    sessions = list(set([r.session_id for r in records if r.session_id]))
    if "default" not in sessions:
        sessions.insert(0, "default")
    return {"sessions": sessions}

@router.get("/projects/{project_id}/chat/history")
def get_chat_history(
    project_id: uuid.UUID,
    session_id: str = "default",
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    project = session.get(Project, project_id)
    if not project or project.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Permission denied")
        
    records = session.exec(
        select(CopilotMessage)
        .where(CopilotMessage.project_id == project_id)
        .where(CopilotMessage.session_id == session_id)
        .order_by(CopilotMessage.created_at.asc())
    ).all()
    
    return [{"role": r.role, "content": r.content, "plan_data": r.plan_data} for r in records]

@router.post("/projects/{project_id}/chat")
def chat_with_copilot(
    project_id: uuid.UUID,
    payload: ChatRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    project = session.get(Project, project_id)
    if not project or project.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Permission denied")

    user_msg = CopilotMessage(project_id=project_id, session_id=payload.session_id, role="user", content=payload.message)
    session.add(user_msg)
    session.commit()

    history_records = session.exec(
        select(CopilotMessage)
        .where(CopilotMessage.project_id == project_id)
        .where(CopilotMessage.session_id == payload.session_id)
        .order_by(CopilotMessage.created_at.asc())
    ).all()
    history = [{"role": msg.role, "content": msg.content} for msg in history_records[-20:]]

    workflows = session.exec(select(WorkflowTemplate)).all()
    wf_list_str = "\n".join([f"- Workflow: '{w.script_path}', Desc: {w.description}" for w in workflows])

    # 👇 获取当前项目的文件列表，传递给 AI 增加上下文
    linked_files = session.exec(select(File).join(ProjectFileLink).where(ProjectFileLink.project_id == project_id)).all()
    file_list_str = "\n".join([f"- {f.filename} (Size: {f.size} bytes)" for f in linked_files]) if linked_files else "No files uploaded yet."

    result = run_copilot_planner(str(project_id), history, wf_list_str, file_list_str)

    ai_msg = CopilotMessage(
        project_id=project_id,
        session_id=payload.session_id,
        role="assistant", 
        content=result["reply"],
        plan_data=result["plan_data"]
    )
    session.add(ai_msg)
    session.commit()

    return {"role": "assistant", "content": result["reply"], "plan_data": result["plan_data"]}

@router.post("/projects/{project_id}/chat/execute-plan")
def execute_plan(
    project_id: uuid.UUID,
    payload: ExecutePlanRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """用户点击确认方案后触发：自动生成任务记录并投递给 Celery"""
    project = session.get(Project, project_id)
    if not project or project.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Permission denied")

    plan = payload.plan_data
    method = plan.get("method")

    analysis = Analysis(
        project_id=project_id,
        workflow=plan.get("workflow_name") if method == "workflow" else "custom_sandbox_analysis",
        status="pending",
        params_json=json.dumps(plan.get("parameters", {})) if method == "workflow" else ""
    )
    session.add(analysis)
    session.commit()
    session.refresh(analysis)

    # 👇 将 session_id 传递给 Celery 后台任务，以便任务完成后写回聊天记录
    if method == "workflow":
        from app.worker import run_nextflow_pipeline
        run_nextflow_pipeline.delay(str(analysis.id), str(project_id), analysis.workflow, plan.get("parameters", {}), payload.session_id)
    elif method == "sandbox":
        from app.worker import run_sandbox_task
        run_sandbox_task.delay(str(analysis.id), str(project_id), plan.get("custom_code", ""), payload.session_id)

    sys_msg = CopilotMessage(
        project_id=project_id,
        session_id=payload.session_id,
        role="assistant",
        content=f"🚀 **Task Started!** (Task ID: `{str(analysis.id)[:8]}`) \n\nI have submitted analysis task to cluster. **I will notify you right here when it's done!**"
    )
    session.add(sys_msg)
    session.commit()

    return {"status": "success", "analysis_id": str(analysis.id)}

# (原有诊断接口不变)
class DiagnoseResponse(BaseModel):
    diagnosis: str

@router.post("/projects/{project_id}/analyses/{analysis_id}/diagnose", response_model=DiagnoseResponse)
def diagnose_analysis_error(
    project_id: uuid.UUID,
    analysis_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    from langchain_core.messages import SystemMessage, HumanMessage
    project = session.get(Project, project_id)
    if not project or project.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Project not found")
    analysis = session.get(Analysis, analysis_id)
    if not analysis or analysis.project_id != project_id:
        raise HTTPException(status_code=404, detail="Analysis not found")
        
    base_dir = analysis.work_dir if analysis.work_dir else os.path.join(workflow_service.base_work_dir, str(analysis.id))
    log_path = os.path.join(base_dir, "analysis.log")
    
    if not os.path.exists(log_path): raise HTTPException(status_code=404, detail="Log file not found.")
    with open(log_path, "r", encoding="utf-8", errors="replace") as f:
        error_log = "".join(f.readlines()[-150:])
    
    if not error_log.strip(): return DiagnoseResponse(diagnosis="Log file is empty.")

    from app.core.agent import get_llm 
    llm = get_llm()
    system_prompt = SystemMessage(content="You are a Bioinformatics DevOps. Analyze failed logs. Format:\n1. Root Cause\n2. Detailed Analysis\n3. Actionable Fix\nUse Markdown.")
    user_prompt = HumanMessage(content=f"Log tail for '{analysis.workflow}':\n---\n{error_log}\n---\nDiagnose error.")

    response = llm.invoke([system_prompt, user_prompt])
    return DiagnoseResponse(diagnosis=response.content)
