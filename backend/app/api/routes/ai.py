import uuid
import json
import os
import asyncio
from datetime import datetime
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlmodel import Session, select
from pydantic import BaseModel

from app.core.db import get_session
from app.api.deps import get_current_user
from app.models.user import User, Project, Analysis, CopilotMessage, File, ProjectFileLink, SampleSheet, TaskChain
from app.models.bio import WorkflowTemplate
from app.models.conversation import Conversation, ConversationMessage
from app.core.llm import llm_client
from app.core.agent import run_copilot_planner, run_copilot_planner_stream, run_copilot_planner_with_matching
from app.services.workflow_service import workflow_service
from app.services.sandbox import sandbox_service

router = APIRouter()

# ================================
# 1. 代码生成与解析端点 (保留您的原有功能)
# ================================
class ChatMessageDef(BaseModel):
    role: str 
    content: str

class GenerateRequest(BaseModel):
    messages: List[ChatMessageDef]
    mode: str = "MODULE" 
    current_code: Optional[str] = None

class GenerateResponse(BaseModel):
    main_nf: str
    params_schema: str
    description: str
    explanation: str

class ParseParamsRequest(BaseModel):
    code: str
    mode: str = "TOOL" 

@router.post("/generate", response_model=GenerateResponse)
async def generate_workflow_code(
    payload: GenerateRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    conversation = [m.model_dump() for m in payload.messages]
    if payload.current_code and len(conversation) > 0:
        last_msg = conversation[-1]
        if last_msg['role'] == 'user':
            last_msg['content'] += f"\n\n[Current Code Context]:\n{payload.current_code}"

    available_modules_str = ""
    if payload.mode == "PIPELINE":
        modules = session.exec(select(WorkflowTemplate).where(WorkflowTemplate.workflow_type == "MODULE")).all()
        if modules:
            module_list = [f"- Module Name: {m.name}\n  Description: {m.description}" for m in modules]
            available_modules_str = "\n".join(module_list)
        else:
            available_modules_str = "No existing modules found in database."

    try:
        result = llm_client.generate_workflow(messages=conversation, mode=payload.mode, available_modules=available_modules_str)
        return GenerateResponse(**result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/parse_params")
async def parse_params(payload: ParseParamsRequest, current_user: User = Depends(get_current_user)):
    if not payload.code.strip(): raise HTTPException(status_code=400, detail="Code is empty")
    try:
        schema_str = llm_client.generate_schema_from_code(payload.code, payload.mode)
        return {"params_schema": schema_str}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class ExecuteRequestRaw(BaseModel):
    code: str

@router.post("/projects/{project_id}/sandbox/execute")
def execute_sandbox_code(project_id: uuid.UUID, payload: ExecuteRequestRaw, session: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    project = session.get(Project, project_id)
    if not project or project.owner_id != current_user.id: raise HTTPException(status_code=404, detail="Permission denied.")
    if not payload.code.strip(): raise HTTPException(status_code=400, detail="Code cannot be empty.")

    setup_code = "import os\nimport sys\nimport pandas as pd\nimport warnings\nwarnings.filterwarnings('ignore')\nDATA_DIR = '/data'\nWORK_DIR = '/workspace'\nos.chdir(WORK_DIR)\n\n"
    final_code = setup_code + payload.code

    try:
        result = sandbox_service.execute_python(project_id=str(project_id), code=final_code, timeout=60)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Sandbox Error: {str(e)}")


# ================================
# 2. Bio-Copilot 智能会话核心功能
# ================================
class ChatRequest(BaseModel):
    message: str
    session_id: str = "default"

class ExecutePlanRequest(BaseModel):
    plan_data: dict
    conversation_id: Optional[str] = None  # UUID string for Conversation
    session_id: str = "default"  # Kept for backward compatibility
    plan_data: dict
    session_id: str = "default"

@router.post("/projects/{project_id}/chat/execute-plan")
def execute_plan(project_id: uuid.UUID, payload: ExecutePlanRequest, session: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    project = session.get(Project, project_id)
    if not project or project.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    plan = payload.plan_data
    plan_type = plan.get("type", "single")
    
    if plan_type == "tool_recommendation":
        matched_tools = plan.get("matched_tools", [])
        if not matched_tools:
            raise HTTPException(status_code=400, detail="No matched tools in tool_recommendation plan")
        
        tool = matched_tools[0]
        template = session.get(WorkflowTemplate, uuid.UUID(tool["tool_id"]))
        if not template:
            raise HTTPException(status_code=404, detail=f"Tool {tool['tool_name']} not found")
        
        analysis = Analysis(
            project_id=project_id,
            workflow=template.script_path,
            status="pending",
            params_json=json.dumps(tool.get("suggested_params", {}))
        )
        session.add(analysis)
        session.commit()
        session.refresh(analysis)
        
        # Create message with task detail link
        task_link = f"/dashboard/task/{analysis.id}"
        sys_msg = CopilotMessage(
            project_id=project_id, 
            session_id=payload.session_id, 
            role="assistant", 
            content=f"🚀 **Tool Execution Started!**\n\n"
                     f"**Tool:** {template.name}\n"
                     f"**Match Score:** {tool['match_score']:.0%}\n\n"
                     f"Task ID: `{str(analysis.id)[:8]}`\n\n"
                     f"[📊 View Task Details](/dashboard/task/{analysis.id})\n\n"
                     f"I will notify you right here when it's done!"
        )
        session.add(sys_msg)
        session.commit()
        
        return {"status": "success", "analysis_id": str(analysis.id), "task_link": task_link}
    
    elif plan_type == "tool_choice":
        selected_tool_id = plan.get("selected_tool_id")
        template = session.get(WorkflowTemplate, uuid.UUID(selected_tool_id))
        
        if not template:
            raise HTTPException(status_code=404, detail="Selected tool not found")
        
        analysis = Analysis(
            project_id=project_id,
            workflow=template.script_path,
            status="pending",
            params_json=json.dumps(plan.get("parameters", {}))
        )
        session.add(analysis)
        session.commit()
        session.refresh(analysis)
        
        # Create message with task detail link
        task_link = f"/dashboard/task/{analysis.id}"
        sys_msg = CopilotMessage(
            project_id=project_id, 
            session_id=payload.session_id, 
            role="assistant", 
            content=f"🚀 **Tool Execution Started!**\n\n"
                     f"**Tool:** {template.name}\n\n"
                     f"Task ID: `{str(analysis.id)[:8]}`\n\n"
                     f"[📊 View Task Details](/dashboard/task/{analysis.id})\n\n"
                     f"I will notify you right here when it's done!"
        )
        session.add(sys_msg)
        session.commit()
        
        return {"status": "success", "analysis_id": str(analysis.id), "task_link": task_link}
    
    elif plan_type == "single":
        method = plan.get("method", "sandbox")
        workflow_name = plan.get("workflow_name")
        auto_sample_sheet_id = None
        
        if method == "workflow":
            if not workflow_name or str(workflow_name).strip().lower() in ["none", "null", ""]:
                raise HTTPException(status_code=400, detail="AI returned an invalid workflow Name ('None'). Please reply to AI: 'There is no such workflow, please use sandbox.'")
            
            template = session.exec(select(WorkflowTemplate).where(WorkflowTemplate.script_path == workflow_name)).first()
            if not template:
                raise HTTPException(status_code=400, detail=f"The tool '{workflow_name}' does not exist in the system.")
                
            is_pipeline = (template.workflow_type != "TOOL")
            if is_pipeline:
                latest_sheet = session.exec(select(SampleSheet).where(SampleSheet.project_id == project_id).order_by(SampleSheet.created_at.desc())).first()
                if latest_sheet:
                    auto_sample_sheet_id = latest_sheet.id
                else:
                    raise HTTPException(status_code=400, detail=f"Pipeline '{workflow_name}' requires a SampleSheet. Please go to the 'Data' tab and create one.")

        analysis = Analysis(
            project_id=project_id,
            workflow=workflow_name if method == "workflow" else "custom_sandbox_analysis",
            status="pending",
            params_json=json.dumps(plan.get("parameters", {})) if method == "workflow" else "{}",
            sample_sheet_id=auto_sample_sheet_id
        )
        session.add(analysis)
        session.commit()
        session.refresh(analysis)

        if method == "workflow":
            from app.worker import run_ai_workflow_task
            run_ai_workflow_task.delay(str(analysis.id), payload.session_id)
        elif method == "sandbox":
            from app.worker import run_sandbox_task
            run_sandbox_task.delay(str(analysis.id), str(project_id), plan.get("custom_code", ""), payload.session_id)

        sys_msg = CopilotMessage(project_id=project_id, session_id=payload.session_id, role="assistant", content=f"🚀 **Task Started!** (Task ID: `{str(analysis.id)[:8]}`) \n\nI have submitted the task to the engine. **I will notify you right here when it's done!**")
        session.add(sys_msg)
        session.commit()

        return {"status": "success", "analysis_id": str(analysis.id)}

    elif plan_type == "multi":
        steps = plan.get("steps", [])
        if not steps:
            raise HTTPException(status_code=400, detail="No steps provided in plan")
        
        total_steps = len(steps)
        
        chain = TaskChain(
            project_id=project_id,
            session_id=payload.session_id,
            status="pending",
            current_step=0,
            total_steps=total_steps,
            strategy=plan.get("strategy", ""),
            steps_json=json.dumps(steps)
        )
        session.add(chain)
        session.commit()
        session.refresh(chain)
        
        from app.worker import run_task_chain
        run_task_chain.delay(str(chain.id))
        
        steps_preview = "\n".join([f"| {s.get('step', i+1)} | {s.get('action', 'N/A')} | {s.get('expected_output', 'N/A')[:30]}... |" for i, s in enumerate(steps)])
        
        sys_msg = CopilotMessage(
            project_id=project_id, 
            session_id=payload.session_id, 
            role="assistant", 
            content=f"🔗 **Multi-Step Task Chain Started!** (ID: `{str(chain.id)[:8]}`)\n\n"
                     f"**Strategy:** {plan.get('strategy', 'N/A')}\n\n"
                     f"**Steps:**\n| Step | Action | Expected Output |\n|------|--------|----------------|\n{steps_preview}\n\n"
                     f"I will execute each step sequentially and notify you of Progress!"
        )
        session.add(sys_msg)
        session.commit()
        
        return {"status": "success", "chain_id": str(chain.id), "total_steps": total_steps}
    
    else:
        raise HTTPException(status_code=400, detail=f"Unknown plan type: {plan_type}")

# ================================
# 4. 多步骤任务链执行端点
# ================================
class ExecuteChainRequest(BaseModel):
    plan_data: dict
    session_id: str = "default"

@router.post("/projects/{project_id}/chat/execute-chain")
def execute_task_chain(project_id: uuid.UUID, payload: ExecuteChainRequest, session: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    project = session.get(Project, project_id)
    if not project or project.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Permission denied")

    plan = payload.plan_data
    strategy = plan.get("strategy", "")
    steps = plan.get("steps", [])
    
    if not steps:
        raise HTTPException(status_code=400, detail="No steps provided in plan")

    total_steps = len(steps)
    
    chain = TaskChain(
        project_id=project_id,
        session_id=payload.session_id,
        status="pending",
        current_step=0,
        total_steps=total_steps,
        strategy=strategy,
        steps_json=json.dumps(steps)
    )
    session.add(chain)
    session.commit()
    session.refresh(chain)

    from app.worker import run_task_chain
    run_task_chain.delay(str(chain.id))

    steps_preview = "\n".join([f"| {s.get('step', i+1)} | {s.get('action', 'N/A')} | {s.get('expected_output', 'N/A')[:30]}... |" for i, s in enumerate(steps)])
    
    sys_msg = CopilotMessage(
        project_id=project_id, 
        session_id=payload.session_id, 
        role="assistant", 
        content=f"🔗 **Multi-Step Task Chain Started!** (ID: `{str(chain.id)[:8]}`)\n\n"
                f"**Strategy:** {strategy}\n\n"
                f"**Steps:**\n| Step | Action | Expected Output |\n|------|--------|----------------|\n{steps_preview}\n\n"
                f"I will execute each step sequentially and notify you of progress!"
    )
    session.add(sys_msg)
    session.commit()

    return {"status": "success", "chain_id": str(chain.id), "total_steps": total_steps}

@router.get("/projects/{project_id}/chains")
def get_task_chains(project_id: uuid.UUID, session: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    project = session.get(Project, project_id)
    if not project or project.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    chains = session.exec(select(TaskChain).where(TaskChain.project_id == project_id).order_by(TaskChain.created_at.desc())).all()
    
    return [{
        "id": str(c.id),
        "status": c.status,
        "current_step": c.current_step,
        "total_steps": c.total_steps,
        "strategy": c.strategy,
        "retry_count": c.retry_count,
        "created_at": c.created_at.isoformat()
    } for c in chains]

@router.get("/projects/{project_id}/chains/{chain_id}")
def get_task_chain_detail(project_id: uuid.UUID, chain_id: uuid.UUID, session: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    project = session.get(Project, project_id)
    if not project or project.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    chain = session.get(TaskChain, chain_id)
    if not chain or chain.project_id != project_id:
        raise HTTPException(status_code=404, detail="Task chain not found")
    
    return {
        "id": str(chain.id),
        "status": chain.status,
        "current_step": chain.current_step,
        "total_steps": chain.total_steps,
        "strategy": chain.strategy,
        "steps": json.loads(chain.steps_json),
        "retry_count": chain.retry_count,
        "last_error": chain.last_error,
        "created_at": chain.created_at.isoformat(),
        "updated_at": chain.updated_at.isoformat()
    }

# ================================
# 3. 错误诊断功能
# ================================
class DiagnoseResponse(BaseModel):
    diagnosis: str

@router.post("/projects/{project_id}/analyses/{analysis_id}/diagnose", response_model=DiagnoseResponse)
def diagnose_analysis_error(project_id: uuid.UUID, analysis_id: uuid.UUID, session: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    from langchain_core.messages import SystemMessage, HumanMessage
    project = session.get(Project, project_id)
    if not project or project.owner_id != current_user.id: raise HTTPException(status_code=403, detail="Project not found")
    analysis = session.get(Analysis, analysis_id)
    if not analysis or analysis.project_id != project_id: raise HTTPException(status_code=404, detail="Analysis not found")
        
    base_dir = analysis.work_dir if analysis.work_dir else os.path.join(workflow_service.base_work_dir, str(analysis.id))
    log_path = os.path.join(base_dir, "analysis.log")
    
    if not os.path.exists(log_path): raise HTTPException(status_code=404, detail="Log file not found.")
    with open(log_path, "r", encoding="utf-8", errors="replace") as f: error_log = "".join(f.readlines()[-150:])
    if not error_log.strip(): return DiagnoseResponse(diagnosis="Log file is empty.")

    from app.core.agent import get_llm 
    llm = get_llm()
    system_prompt = SystemMessage(content="You are a Bioinformatics DevOps. Analyze failed logs. Format:\n1. Root Cause\n2. Detailed Analysis\n3. Actionable Fix\nUse Markdown.")
    user_prompt = HumanMessage(content=f"Log tail for '{analysis.workflow}':\n---\n{error_log}\n---\nDiagnose error.")
    response = llm.invoke([system_prompt, user_prompt])
    return DiagnoseResponse(diagnosis=response.content)

# ================================
# 5. Chat Session & History Management
# ================================
@router.get("/projects/{project_id}/chat/sessions")
def get_chat_sessions(
    project_id: uuid.UUID, 
    session: Session = Depends(get_session), 
    current_user: User = Depends(get_current_user)
):
    project = session.get(Project, project_id)
    if not project or project.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    from sqlalchemy import func
    sessions_query = session.exec(
        select(
            CopilotMessage.session_id,
            func.max(CopilotMessage.created_at).label("last_activity")
        )
        .where(CopilotMessage.project_id == project_id)
        .group_by(CopilotMessage.session_id)
        .order_by(func.max(CopilotMessage.created_at).desc())
    ).all()
    
    sessions = [s[0] for s in sessions_query]
    if 'default' not in sessions:
        sessions.insert(0, 'default')
    
    return {"sessions": sessions}

@router.delete("/projects/{project_id}/chat/sessions/{session_id}")
def delete_chat_session(
    project_id: uuid.UUID,
    session_id: str,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """删除指定 session 的聊天记录（不删除已完成的任务）"""
    project = session.get(Project, project_id)
    if not project or project.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    if session_id == "default":
        raise HTTPException(status_code=400, detail="Cannot delete the default session")
    
    from sqlalchemy import delete
    delete_stmt = delete(CopilotMessage).where(
        CopilotMessage.project_id == project_id,
        CopilotMessage.session_id == session_id
    )
    session.exec(delete_stmt)
    session.commit()
    
    return {"status": "deleted", "message": f"Session '{session_id}' has been deleted"}

@router.delete("/projects/{project_id}/chat/sessions/{session_id}/clear")
def clear_chat_session(
    project_id: uuid.UUID,
    session_id: str,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """清空指定 session 的聊天记录（保留 session）"""
    project = session.get(Project, project_id)
    if not project or project.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    from sqlalchemy import delete
    delete_stmt = delete(CopilotMessage).where(
        CopilotMessage.project_id == project_id,
        CopilotMessage.session_id == session_id
    )
    result = session.exec(delete_stmt)
    session.commit()
    
    return {"status": "cleared", "message": f"Session '{session_id}' history has been cleared", "deleted_count": result.rowcount if hasattr(result, 'rowcount') else 0}

class ChatHistoryResponse(BaseModel):
    messages: List[Dict[str, Any]]
    has_more: bool
    oldest_created_at: Optional[str]

@router.get("/projects/{project_id}/chat/history", response_model=ChatHistoryResponse)
def get_chat_history(
    project_id: uuid.UUID,
    session_id: str = "default",
    limit: int = 20,
    before: Optional[str] = None,
    session_db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    project = session_db.get(Project, project_id)
    if not project or project.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    query = select(CopilotMessage).where(
        CopilotMessage.project_id == project_id,
        CopilotMessage.session_id == session_id
    )
    
    if before:
        try:
            before_dt = datetime.fromisoformat(before.replace('Z', '+00:00'))
            query = query.where(CopilotMessage.created_at < before_dt)
        except:
            pass
    
    query = query.order_by(CopilotMessage.created_at.desc()).limit(limit + 1)
    
    messages = session_db.exec(query).all()
    
    has_more = len(messages) > limit
    if has_more:
        messages = messages[:limit]
    
    messages.reverse()
    
    oldest_created_at = None
    if messages:
        oldest_created_at = messages[0].created_at.isoformat()
    
    return ChatHistoryResponse(
        messages=[{
            "role": m.role,
            "content": m.content,
            "plan_data": m.plan_data,
            "attachments": m.attachments,
            "created_at": m.created_at.isoformat()
        } for m in messages],
        has_more=has_more,
        oldest_created_at=oldest_created_at
    )

@router.get("/projects/{project_id}/chat/has-pending-tasks")
def check_pending_tasks(
    project_id: uuid.UUID,
    session_db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    project = session_db.get(Project, project_id)
    if not project or project.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    pending_analyses = session_db.exec(
        select(Analysis)
        .where(Analysis.project_id == project_id)
        .where(Analysis.status.in_(["pending", "running"]))
    ).all()
    
    pending_chains = session_db.exec(
        select(TaskChain)
        .where(TaskChain.project_id == project_id)
        .where(TaskChain.status.in_(["pending", "running"]))
    ).all()
    
    count = len(pending_analyses) + len(pending_chains)
    
    return {"has_pending": count > 0, "count": count}

# ================================
# 6. Chat Stream Endpoint (with Tool Matching)
# ================================
class ChatStreamRequest(BaseModel):
    message: str
    conversation_id: Optional[str] = None  # UUID string for Conversation
    session_id: str = "default"  # Kept for backward compatibility
@router.post("/projects/{project_id}/chat/stream")
async def chat_stream(
    project_id: uuid.UUID,
    payload: ChatStreamRequest,
    session_db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    print(f"\n{'='*60}", flush=True)
    print(f"[Chat Stream] 收到请求 - project_id: {project_id}", flush=True)
    print(f"[Chat Stream] 用户: {current_user.email}", flush=True)
    print(f"[Chat Stream] session_id: {payload.session_id}", flush=True)
    print(f"[Chat Stream] 消息: {payload.message[:100]}...", flush=True)
    
    project = session_db.get(Project, project_id)
    if not project or project.owner_id != current_user.id:
        print(f"[Chat Stream] 权限拒绝", flush=True)
        raise HTTPException(status_code=403, detail="Permission denied")
    
    # Determine conversation_id - prefer new param, fallback to session_id
    conv_id_str = payload.conversation_id or payload.session_id
    print(f"[Chat Stream] conversation_id: {conv_id_str}", flush=True)
    print(f"[Chat Stream] 消息: {payload.message[:100]}...", flush=True)
    
    # Check if conversation exists, create if not
    conversation = None
    try:
        conv_uuid = uuid.UUID(conv_id_str)
        conversation = session_db.get(Conversation, conv_uuid)
    except:
        pass
    
    # If conversation doesn't exist, create one
    if not conversation:
        conversation = Conversation(
            project_id=project_id,
            title=payload.message[:50] + "..." if len(payload.message) > 50 else payload.message
        )
        session_db.add(conversation)
        session_db.commit()
        session_db.refresh(conversation)
        print(f"[Chat Stream] 创建新会话: {conversation.id}", flush=True)
    
    # Verify conversation belongs to the project
    if conversation.project_id != project_id:
        raise HTTPException(status_code=403, detail="Conversation does not belong to this project")
    
    # Save user message using ConversationMessage
    user_msg = ConversationMessage(
        conversation_id=conversation.id,
        role="user",
        content=payload.message
    )
    session_db.add(user_msg)
    session_db.commit()
    print(f"[Chat Stream] 用户消息已保存到Conversation", flush=True)
    
    # Get history from ConversationMessage
    history_msgs = session_db.exec(
        select(ConversationMessage)
        .where(ConversationMessage.conversation_id == conversation.id)
        .order_by(ConversationMessage.created_at)
    ).all()
    
    history = [{"role": m.role, "content": m.content} for m in history_msgs]
    print(f"[Chat Stream] 历史消息数: {len(history)}", flush=True)
    templates = session_db.exec(
        select(WorkflowTemplate).where(WorkflowTemplate.is_public == True)
    ).all()
    
    if templates:
        workflows_info = "\n".join([
            f"- {t.name} ({t.workflow_type}): {t.description or 'No description'}"
            for t in templates
        ])
    else:
        workflows_info = "No workflows available"
    print(f"[Chat Stream] 可用工作流数: {len(templates)}", flush=True)
    
    project_files = session_db.exec(
        select(File)
        .join(ProjectFileLink, File.id == ProjectFileLink.file_id)
        .where(ProjectFileLink.project_id == project_id)
    ).all()
    
    if project_files:
        files_info = "\n".join([
            f"- {f.filename} ({f.content_type}, {f.size} bytes)"
            for f in project_files
        ])
    else:
        files_info = "No files in project"
    print(f"[Chat Stream] 项目文件数: {len(project_files)}", flush=True)
    
    print(f"[Chat Stream] 开始调用 run_copilot_planner_with_matching...", flush=True)
    
    try:
        result = run_copilot_planner_with_matching(
            str(project_id),
            history,
            workflows_info,
            files_info,
            session_db
        )
        print(f"[Chat Stream] LLM 返回结果类型: {result.get('plan_type', 'text')}", flush=True)
        print(f"[Chat Stream] 回复内容预览: {result['reply'][:100]}...", flush=True)
    except Exception as e:
        print(f"[Chat Stream] LLM 调用失败: {e}", flush=True)
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"LLM Error: {str(e)}")
    
    # Save AI response using ConversationMessage
    ai_msg = ConversationMessage(
        conversation_id=conversation.id,
        role="assistant",
        content=result["reply"],
        response_mode=result.get("plan_type"),
        response_data=result.get("plan_data")
    )
    session_db.add(ai_msg)
    
    # Update conversation's updated_at
    conversation.updated_at = datetime.utcnow()
    session_db.add(conversation)
    session_db.commit()
    async def event_generator():
        yield f"data: {json.dumps({'type': 'start'})}\n\n"
        
        content = result["reply"]
        for i, char in enumerate(content):
            yield f"data: {json.dumps({'type': 'token', 'content': char})}\n\n"
            if i % 5 == 0:
                await asyncio.sleep(0.01)
        
        if result.get("plan_data"):
            yield f"data: {json.dumps({'type': 'plan', 'plan_data': result['plan_data'], 'plan_type': result.get('plan_type')})}\n\n"
        
        yield f"data: {json.dumps({'type': 'done', 'full_content': content, 'plan_data': result.get('plan_data'), 'plan_type': result.get('plan_type')})}\n\n"
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        }
    )

# ================================
# 7. Tool Selection Confirmation
# ================================
class ConfirmToolRequest(BaseModel):
    tool_id: str
    parameters: Dict[str, Any] = {}
    session_id: str = "default"

@router.post("/projects/{project_id}/chat/confirm-tool")
def confirm_tool_selection(
    project_id: uuid.UUID,
    payload: ConfirmToolRequest,
    session_db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    project = session_db.get(Project, project_id)
    if not project or project.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    template = session_db.get(WorkflowTemplate, uuid.UUID(payload.tool_id))
    if not template:
        raise HTTPException(status_code=404, detail="Tool not found")
    
    analysis = Analysis(
        project_id=project_id,
        workflow=template.script_path,
        status="pending",
        params_json=json.dumps(payload.parameters)
    )
    session_db.add(analysis)
    session_db.commit()
    session_db.refresh(analysis)
    
    from app.worker import run_ai_workflow_task
    run_ai_workflow_task.delay(str(analysis.id), payload.session_id)
    
    sys_msg = CopilotMessage(
        project_id=project_id,
        session_id=payload.session_id,
        role="assistant",
        content=f"🔧 **Tool Confirmed & Started!**\n\n"
                f"**Tool:** {template.name}\n"
                f"**Task ID:** `{str(analysis.id)[:8]}`\n\n"
                f"Executing with your selected parameters..."
    )
    session_db.add(sys_msg)
    session_db.commit()
    
    return {"status": "success", "analysis_id": str(analysis.id)}

# ================================
# 8. Save Analysis as Template
# ================================
class SaveTemplateRequest(BaseModel):
    analysis_id: str
    name: str
    description: Optional[str] = None
    category: Optional[str] = None
    make_public: bool = False

@router.post("/projects/{project_id}/chat/save-template")
def save_analysis_as_template(
    project_id: uuid.UUID,
    payload: SaveTemplateRequest,
    session_db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    project = session_db.get(Project, project_id)
    if not project or project.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    analysis = session_db.get(Analysis, uuid.UUID(payload.analysis_id))
    if not analysis or analysis.project_id != project_id:
        raise HTTPException(status_code=404, detail="Analysis not found")
    
    if analysis.status != "completed":
        raise HTTPException(status_code=400, detail="Only completed analyses can be saved as templates")
    
    from app.services.template_saver import template_saver
    
    try:
        if current_user.id is None:
            raise HTTPException(status_code=401, detail="User not authenticated")
        
        template = template_saver.save_from_analysis(
            analysis=analysis,
            name=payload.name,
            description=payload.description,
            category=payload.category,
            owner_id=current_user.id,
            make_public=payload.make_public,
            session=session_db
        )
        
        return {
            "status": "success",
            "template_id": str(template.id),
            "message": f"Template '{template.name}' saved successfully!" + 
                       (" It will be available to others after review." if payload.make_public else "")
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save template: {str(e)}")

@router.get("/projects/{project_id}/analyses/{analysis_id}/can-save-template")
def check_can_save_template(
    project_id: uuid.UUID,
    analysis_id: uuid.UUID,
    session_db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    project = session_db.get(Project, project_id)
    if not project or project.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    analysis = session_db.get(Analysis, analysis_id)
    if not analysis or analysis.project_id != project_id:
        raise HTTPException(status_code=404, detail="Analysis not found")
    
    can_save = analysis.status == "completed" and analysis.workflow == "custom_sandbox_analysis"
    
    return {
        "can_save": can_save,
        "reason": None if can_save else "Only completed custom sandbox analyses can be saved as templates"
    }


# ================================
# 9. Multi-Model Support (Phase 3)
# ================================

class ModelInfo(BaseModel):
    id: str
    name: str
    provider: str
    description: str
    supports_streaming: bool = True
    supports_vision: bool = False
    max_tokens: int = 4096

AVAILABLE_MODELS = [
    {
        "id": "qwen2.5-coder:32b",
        "name": "Qwen 2.5 Coder 32B",
        "provider": "Ollama",
        "description": "Code-specialized model, great for bioinformatics scripts",
        "supports_streaming": True,
        "supports_vision": False,
        "max_tokens": 32000
    },
    {
        "id": "llama3.1:70b",
        "name": "Llama 3.1 70B",
        "provider": "Ollama",
        "description": "General purpose model with strong reasoning",
        "supports_streaming": True,
        "supports_vision": False,
        "max_tokens": 128000
    },
    {
        "id": "deepseek-r1:70b",
        "name": "DeepSeek R1 70B",
        "provider": "Ollama",
        "description": "Advanced reasoning model with chain-of-thought",
        "supports_streaming": True,
        "supports_vision": False,
        "max_tokens": 64000
    },
    {
        "id": "qwen2.5:72b",
        "name": "Qwen 2.5 72B",
        "provider": "Ollama",
        "description": "General purpose model with excellent Chinese support",
        "supports_streaming": True,
        "supports_vision": False,
        "max_tokens": 32000
    }
]

@router.get("/models", response_model=List[ModelInfo])
def get_available_models():
    """Get list of available AI models"""
    return [ModelInfo(**m) for m in AVAILABLE_MODELS]

@router.get("/models/{model_id}")
def get_model_info(model_id: str):
    """Get specific model information"""
    for m in AVAILABLE_MODELS:
        if m["id"] == model_id:
            return ModelInfo(**m)
    raise HTTPException(status_code=404, detail="Model not found")


# ================================
# 10. Document Upload for Long Text (Phase 3)
# ================================

class DocumentUploadRequest(BaseModel):
    filename: str
    content_type: str

@router.post("/projects/{project_id}/documents/upload")
async def upload_document(
    project_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """Upload large document for long text conversation"""
    project = session.get(Project, project_id)
    if not project or project.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    return {"status": "use multipart form upload"}


# ================================
# 11. Voice Input Transcription (Phase 3)
# ================================

class TranscriptionRequest(BaseModel):
    audio_data: str  # base64 encoded

class TranscriptionResponse(BaseModel):
    text: str
    confidence: float = 1.0

@router.post("/transcribe", response_model=TranscriptionResponse)
async def transcribe_audio(
    payload: TranscriptionRequest,
    current_user: User = Depends(get_current_user)
):
    """Transcribe audio using Whisper (server-side)"""
    raise HTTPException(status_code=501, detail="Server-side transcription not implemented. Use browser Web Speech API.")


# ================================
# 12. Phase 4: MCP Protocol Support & Enhanced Agent
# ================================

class MCPServerConfig(BaseModel):
    name: str
    command: str
    args: List[str] = []
    env: Dict[str, str] = {}

class MCPServerInfo(BaseModel):
    name: str
    status: str
    tools_count: int = 0

@router.get("/mcp/servers", response_model=List[MCPServerInfo])
def list_mcp_servers(current_user: User = Depends(get_current_user)):
    """List configured MCP servers"""
    # Placeholder - MCP server management
    return [
        MCPServerInfo(name="pubmed_search", status="available", tools_count=1),
        MCPServerInfo(name="geo_database", status="available", tools_count=1),
    ]

@router.post("/mcp/servers")
def add_mcp_server(
    config: MCPServerConfig,
    current_user: User = Depends(get_current_user)
):
    """Add MCP server configuration"""
    return {
        "status": "success",
        "message": f"MCP server '{config.name}' configured",
        "server": config.model_dump()
    }

@router.delete("/mcp/servers/{server_name}")
def remove_mcp_server(
    server_name: str,
    current_user: User = Depends(get_current_user)
):
    """Remove MCP server"""
    return {"status": "success", "message": f"MCP server '{server_name}' removed"}

@router.get("/mcp/servers/{server_name}/tools")
def list_mcp_tools(
    server_name: str,
    current_user: User = Depends(get_current_user)
):
    """List tools available from MCP server"""
    # Placeholder - return available tools
    tools_map = {
        "pubmed_search": ["search_pubmed"],
        "geo_database": ["search_geo"],
    }
    return {"server": server_name, "tools": tools_map.get(server_name, [])}


# ================================
# 13. Enhanced ReAct Agent Endpoint
# ================================

class ReactAgentRequest(BaseModel):
    message: str
    session_id: str = "default"
    use_react: bool = True

@router.post("/projects/{project_id}/chat/react")
async def chat_with_react_agent(
    project_id: uuid.UUID,
    payload: ReactAgentRequest,
    session_db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """Chat with ReAct agent that has tool use capabilities"""
    project = session_db.get(Project, project_id)
    if not project or project.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    # Get history
    history_msgs = session_db.exec(
        select(CopilotMessage)
        .where(CopilotMessage.project_id == project_id)
        .where(CopilotMessage.session_id == payload.session_id)
        .order_by(CopilotMessage.created_at)
    ).all()
    
    history = [{"role": m.role, "content": m.content} for m in history_msgs]
    
    # Get workflows
    templates = session_db.exec(
        select(WorkflowTemplate).where(WorkflowTemplate.is_public == True)
    ).all()
    
    workflows_info = "\n".join([
        f"- {t.name} ({t.workflow_type}): {t.description or 'No description'}"
        for t in templates
    ]) if templates else "None"
    
    # Get files
    files = session_db.exec(
        select(File)
        .join(ProjectFileLink, File.id == ProjectFileLink.file_id)
        .where(ProjectFileLink.project_id == project_id)
    ).all()
    
    files_info = "\n".join([f.filename for f in files]) if files else "None"
    
    # Import and run ReAct agent
    from app.core.react_agent import run_react_agent
    
    result = run_react_agent(
        user_message=payload.message,
        history=history,
        project_files=files_info,
        available_workflows=workflows_info
    )
    
    # Save messages
    user_msg = CopilotMessage(
        project_id=project_id,
        session_id=payload.session_id,
        role="user",
        content=payload.message
    )
    session_db.add(user_msg)
    
    ai_msg = CopilotMessage(
        project_id=project_id,
        session_id=payload.session_id,
        role="assistant",
        content=result["reply"],
        plan_data=result.get("plan_data")
    )
    session_db.add(ai_msg)
    session_db.commit()
    
    return {
        "reply": result["reply"],
        "plan_data": result.get("plan_data"),
        "plan_type": result.get("plan_type"),
        "tools_used": result.get("tools_used", [])
    }
