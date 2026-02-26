import uuid
import json
import os
import asyncio
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlmodel import Session, select
from pydantic import BaseModel

from app.core.db import get_session
from app.api.deps import get_current_user
from app.models.user import User, Project, Analysis, CopilotMessage, File, ProjectFileLink, SampleSheet, TaskChain
from app.models.bio import WorkflowTemplate
from app.core.llm import llm_client
from app.core.agent import run_copilot_planner, run_copilot_planner_stream
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
    session_id: str = "default"

@router.get("/projects/{project_id}/chat/sessions")
def get_chat_sessions(project_id: uuid.UUID, session: Session = Depends(get_session)):
    records = session.exec(select(CopilotMessage.session_id).where(CopilotMessage.project_id == project_id).distinct()).all()
    sessions = list(set([r for r in records if r and isinstance(r, str)]))
    if "default" not in sessions: sessions.insert(0, "default")
    return {"sessions": sessions}

@router.get("/projects/{project_id}/chat/history")
def get_chat_history(project_id: uuid.UUID, session_id: str = "default", session: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    project = session.get(Project, project_id)
    if not project or project.owner_id != current_user.id: raise HTTPException(status_code=403, detail="Permission denied")
    records = session.exec(select(CopilotMessage).where(CopilotMessage.project_id == project_id).where(CopilotMessage.session_id == session_id).order_by(CopilotMessage.created_at.asc())).all()
    return [{"role": r.role, "content": r.content, "plan_data": r.plan_data, "attachments": r.attachments} for r in records]

@router.post("/projects/{project_id}/chat")
def chat_with_copilot(project_id: uuid.UUID, payload: ChatRequest, session: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    project = session.get(Project, project_id)
    if not project or project.owner_id != current_user.id: raise HTTPException(status_code=403, detail="Permission denied")

    user_msg = CopilotMessage(project_id=project_id, session_id=payload.session_id, role="user", content=payload.message)
    session.add(user_msg)
    session.commit()

    history_records = session.exec(select(CopilotMessage).where(CopilotMessage.project_id == project_id).where(CopilotMessage.session_id == payload.session_id).order_by(CopilotMessage.created_at.asc())).all()
    history = [{"role": msg.role, "content": msg.content} for msg in history_records[-20:]]

    workflows = session.exec(select(WorkflowTemplate)).all()
    wf_list_str = "\n".join([f"- Name: '{w.script_path}' (Type: {w.workflow_type}), Desc: {w.description}" for w in workflows])

    linked_files = session.exec(select(File).join(ProjectFileLink).where(ProjectFileLink.project_id == project_id)).all()
    file_list_str = "\n".join([f"- {f.filename} (Size: {f.size} bytes)" for f in linked_files]) if linked_files else "No files uploaded yet."

    result = run_copilot_planner(str(project_id), history, wf_list_str, file_list_str)

    ai_msg = CopilotMessage(project_id=project_id, session_id=payload.session_id, role="assistant", content=result["reply"], plan_data=result["plan_data"])
    session.add(ai_msg)
    session.commit()

    return {"role": "assistant", "content": result["reply"], "plan_data": result["plan_data"]}

@router.post("/projects/{project_id}/chat/stream")
async def chat_with_copilot_stream(
    project_id: uuid.UUID, 
    payload: ChatRequest, 
    session: Session = Depends(get_session), 
    current_user: User = Depends(get_current_user)
):
    project = session.get(Project, project_id)
    if not project or project.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Permission denied")

    async def event_generator():
        try:
            user_msg = CopilotMessage(
                project_id=project_id, 
                session_id=payload.session_id, 
                role="user", 
                content=payload.message
            )
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
            wf_list_str = "\n".join([f"- Name: '{w.script_path}' (Type: {w.workflow_type}), Desc: {w.description}" for w in workflows])

            linked_files = session.exec(select(File).join(ProjectFileLink).where(ProjectFileLink.project_id == project_id)).all()
            file_list_str = "\n".join([f"- {f.filename} (Size: {f.size} bytes)" for f in linked_files]) if linked_files else "No files uploaded yet."

            yield f"data: {json.dumps({'type': 'start'}, ensure_ascii=False)}\n\n"

            full_content = ""
            plan_data = None

            async for chunk in run_copilot_planner_stream(str(project_id), history, wf_list_str, file_list_str):
                if chunk["type"] == "token":
                    full_content += chunk["content"]
                    yield f"data: {json.dumps({'type': 'token', 'content': chunk['content']}, ensure_ascii=False)}\n\n"
                    
                elif chunk["type"] == "plan":
                    plan_data = chunk["plan_data"]
                    yield f"data: {json.dumps({'type': 'plan', 'plan_data': chunk['plan_data']}, ensure_ascii=False)}\n\n"
                    
                elif chunk["type"] == "done":
                    full_content = chunk.get("full_content", full_content)
                    if chunk.get("plan_data"):
                        plan_data = chunk["plan_data"]
                    break
                    
                elif chunk["type"] == "error":
                    yield f"data: {json.dumps({'type': 'error', 'message': chunk['message']}, ensure_ascii=False)}\n\n"
                    return

            ai_msg = CopilotMessage(
                project_id=project_id, 
                session_id=payload.session_id,
                role="assistant", 
                content=full_content,
                plan_data=plan_data
            )
            session.add(ai_msg)
            session.commit()
            session.refresh(ai_msg)

            yield f"data: {json.dumps({'type': 'done', 'message_id': str(ai_msg.id)}, ensure_ascii=False)}\n\n"

        except Exception as e:
            print(f"❌ [Stream Error] {str(e)}", flush=True)
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)}, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        event_generator(), 
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )

@router.post("/projects/{project_id}/chat/execute-plan")
def execute_plan(project_id: uuid.UUID, payload: ExecutePlanRequest, session: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    project = session.get(Project, project_id)
    if not project or project.owner_id != current_user.id: raise HTTPException(status_code=403, detail="Permission denied")

    plan = payload.plan_data
    method = plan.get("method")
    workflow_name = plan.get("workflow_name")
    auto_sample_sheet_id = None
    
    if method == "workflow":
        if not workflow_name or str(workflow_name).strip().lower() in ["none", "null", ""]:
            raise HTTPException(status_code=400, detail="AI returned an invalid workflow name ('None'). Please reply to AI: 'There is no such workflow, please use sandbox to write custom python code.'")
            
        template = session.exec(select(WorkflowTemplate).where(WorkflowTemplate.script_path == workflow_name)).first()
        if not template: raise HTTPException(status_code=400, detail=f"The tool '{workflow_name}' does not exist in the system.")
            
        is_pipeline = (template.workflow_type != "TOOL")
        if is_pipeline:
            latest_sheet = session.exec(select(SampleSheet).where(SampleSheet.project_id == project_id).order_by(SampleSheet.created_at.desc())).first()
            if latest_sheet: auto_sample_sheet_id = latest_sheet.id
            else: raise HTTPException(status_code=400, detail=f"Pipeline '{workflow_name}' requires a SampleSheet. Please go to the 'Data' tab and create one.")

    analysis = Analysis(
        project_id=project_id, workflow=workflow_name if method == "workflow" else "custom_sandbox_analysis",
        status="pending", params_json=json.dumps(plan.get("parameters", {})) if method == "workflow" else "{}",
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
