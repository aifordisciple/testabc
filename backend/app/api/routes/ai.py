from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from pydantic import BaseModel, Field
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

# 👇 追加导入
from app.models.user import Analysis
from app.services.workflow_service import workflow_service
from langchain_core.messages import SystemMessage, HumanMessage
import os

class DiagnoseResponse(BaseModel):
    diagnosis: str

@router.post("/projects/{project_id}/analyses/{analysis_id}/diagnose", response_model=DiagnoseResponse)
def diagnose_analysis_error(
    project_id: uuid.UUID,
    analysis_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """
    智能错误诊断接口：读取失败任务的最后 150 行日志，调用 LLM 分析报错原因。
    """
    # 1. 权限与记录验证
    project = session.get(Project, project_id)
    if not project or project.owner_id != current_user.id:
        raise HTTPException(status_code=404, detail="Project not found")
        
    analysis = session.get(Analysis, analysis_id)
    if not analysis or analysis.project_id != project_id:
        raise HTTPException(status_code=404, detail="Analysis not found")
        
    # 2. 读取日志文件 (取最后 150 行)
    base_dir = analysis.work_dir if analysis.work_dir else os.path.join(workflow_service.base_work_dir, str(analysis.id))
    log_path = os.path.join(base_dir, "analysis.log")
    
    if not os.path.exists(log_path):
        raise HTTPException(status_code=404, detail="Log file not found.")
        
    try:
        with open(log_path, "r", encoding="utf-8", errors="replace") as f:
            lines = f.readlines()
            tail_lines = lines[-150:]
            error_log = "".join(tail_lines)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error reading log: {str(e)}")

    if not error_log.strip():
        return DiagnoseResponse(diagnosis="Log file is empty. The task might not have started properly.")

    # 3. 构建 Prompt 并调用原生 Langchain LLM
    from app.core.agent import get_llm 
    llm = get_llm()
    
    system_prompt = SystemMessage(content="""You are a Senior Bioinformatics DevOps Engineer. 
Your task is to analyze failed execution logs (Nextflow, Docker, Python, or R) and provide a concise, accurate diagnosis.
Output format:
1. **Root Cause**: (What went wrong in simple terms)
2. **Detailed Analysis**: (Explain the specific log error)
3. **Actionable Fix**: (What the user should do to fix it. e.g., 'Increase memory to 4GB', 'Check if input FASTQ is empty', 'Fix parameter typo')
Use Markdown. Be extremely precise and helpful.
""")

    # 修复点：移除了这里的 Markdown 三引号，使用破折号替代，防止代码块被意外截断
    user_prompt = HumanMessage(content=f"""Here is the tail of the failed log for workflow '{analysis.workflow}':

---
{error_log}
---

Please diagnose the error.""")

    try:
        print(f"🩺 [Auto-Debug] Diagnosing analysis {analysis_id}...", flush=True)
        response = llm.invoke([system_prompt, user_prompt])
        return DiagnoseResponse(diagnosis=response.content)
    except Exception as e:
        print(f"Diagnosis LLM Error: {str(e)}", flush=True)
        raise HTTPException(status_code=500, detail="AI diagnosis failed to generate.")


# ================================
# 5. [新增] Copilot 智能分析接口
# ================================
from app.services.copilot_orchestrator import copilot_orchestrator, CopilotResponse
from app.services.workflow_matcher import WorkflowMatch

class CopilotAnalyzeRequest(BaseModel):
    """Copilot 分析请求"""
    query: str = Field(..., description="用户的自然语言分析需求")

class CopilotExecuteRequest(BaseModel):
    """Copilot 执行请求"""
    mode: str = Field(..., description="执行模式: workflow_match | code_generation")
    template_id: Optional[str] = Field(None, description="流程模板ID (workflow_match 模式)")
    sample_sheet_id: Optional[str] = Field(None, description="样本表ID")
    params: Optional[Dict[str, Any]] = Field(default_factory=dict, description="参数")
    generated_code: Optional[str] = Field(None, description="生成的代码 (code_generation 模式)")
    generated_schema: Optional[str] = Field(None, description="生成的参数 Schema")
    workflow_name: Optional[str] = Field(None, description="新流程名称")

@router.post("/projects/{project_id}/copilot/analyze", response_model=CopilotResponse)
async def copilot_analyze(
    project_id: uuid.UUID,
    payload: CopilotAnalyzeRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """
    Copilot 智能分析入口
    
    接收用户的自然语言描述，返回推荐的分析方案：
    - 如果匹配到已有流程，返回流程信息和推断的参数
    - 如果没有匹配，返回生成的自定义代码
    - 如果需求不明确，返回需要澄清的问题
    """
    project = session.get(Project, project_id)
    if not project or project.owner_id != current_user.id:
        raise HTTPException(status_code=404, detail="Project not found")
    
    if not payload.query.strip():
        raise HTTPException(status_code=400, detail="Query cannot be empty")
    
    try:
        result = await copilot_orchestrator.analyze_request(
            user_input=payload.query,
            project_id=str(project_id),
            session=session,
            user=current_user
        )
        return result
    except Exception as e:
        print(f"❌ Copilot Analyze Error: {str(e)}", flush=True)
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/projects/{project_id}/copilot/execute")
async def copilot_execute(
    project_id: uuid.UUID,
    payload: CopilotExecuteRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """
    Copilot 执行入口
    
    用户确认方案后，创建并执行分析任务：
    - workflow_match 模式：使用已有流程模板
    - code_generation 模式：创建新的临时流程并执行
    """
    from app.models.user import Analysis, SampleSheet
    from app.worker import run_workflow_task
    import json
    
    project = session.get(Project, project_id)
    if not project or project.owner_id != current_user.id:
        raise HTTPException(status_code=404, detail="Project not found")
    
    try:
        workflow_name = None
        workflow_script_path = None
        params_json = json.dumps(payload.params) if payload.params else "{}"
        
        if payload.mode == "workflow_match":
            if not payload.template_id:
                raise HTTPException(status_code=400, detail="template_id is required for workflow_match mode")
            
            template = session.get(WorkflowTemplate, uuid.UUID(payload.template_id))
            if not template:
                raise HTTPException(status_code=404, detail="Workflow template not found")
            
            workflow_name = template.script_path or template.name
            
            template.usage_count = (template.usage_count or 0) + 1
            session.add(template)
            session.commit()
            
        elif payload.mode == "code_generation":
            if not payload.generated_code:
                raise HTTPException(status_code=400, detail="generated_code is required for code_generation mode")
            
            workflow_name = payload.workflow_name or f"custom_{uuid.uuid4().hex[:8]}"
            
            new_template = WorkflowTemplate(
                name=workflow_name,
                description=f"AI Generated: {payload.workflow_name or 'Custom Workflow'}",
                category="Custom",
                workflow_type="TOOL",
                source_code=payload.generated_code,
                params_schema=payload.generated_schema or "{}",
                is_public=False
            )
            session.add(new_template)
            session.commit()
            session.refresh(new_template)
            
            workflow_name = new_template.name
            
        else:
            raise HTTPException(status_code=400, detail=f"Invalid mode: {payload.mode}")
        
        sample_sheet_id = None
        if payload.sample_sheet_id:
            try:
                sample_sheet_id = uuid.UUID(payload.sample_sheet_id)
            except:
                pass
        
        analysis = Analysis(
            project_id=project_id,
            workflow=workflow_name,
            params_json=params_json,
            status="pending",
            sample_sheet_id=sample_sheet_id
        )
        session.add(analysis)
        session.commit()
        session.refresh(analysis)
        
        run_workflow_task.delay(str(analysis.id))
        
        print(f"✅ [Copilot Execute] Created analysis {analysis.id}", flush=True)
        
        return {
            "status": "success",
            "analysis_id": str(analysis.id),
            "workflow": workflow_name,
            "message": "任务已创建并开始执行"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Copilot Execute Error: {str(e)}", flush=True)
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))