from fastapi import APIRouter, Depends, HTTPException, Body
from fastapi.responses import FileResponse
from sqlmodel import Session, select
from typing import List, Optional, Any
import uuid
import os

from app.core.db import get_session
from app.api.deps import get_current_user
from app.models.user import User, Project, Analysis, AnalysisCreate, AnalysisPublic, Sample, SampleSheet
from app.services.workflow_service import workflow_service
from app.worker import run_workflow_task

router = APIRouter()

# === 样本相关 ===

@router.get("/projects/{project_id}/samples", response_model=List[dict])
def list_project_samples(
    project_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """
    获取项目下所有样本 (跨所有 SampleSheet)
    """
    # 1. 验证项目
    project = session.get(Project, project_id)
    if not project or project.owner_id != current_user.id:
        raise HTTPException(404, "Project not found")

    # 2. 查找该项目下的所有 SampleSheet
    sheets = session.exec(select(SampleSheet).where(SampleSheet.project_id == project_id)).all()
    if not sheets:
        return []

    # 3. 查找所有样本
    sheet_ids = [s.id for s in sheets]
    samples = session.exec(select(Sample).where(Sample.sample_sheet_id.in_(sheet_ids))).all()
    
    # 返回前端需要的格式 (适配 SamplePublic 或简单 dict)
    # 前端可能期待 files 列表，这里简单返回
    result = []
    for s in samples:
        result.append({
            "id": s.id,
            "name": s.name,
            "group": s.group,
            "replicate": s.replicate,
            "sample_sheet_id": s.sample_sheet_id
            # 如果需要 files 详情，需额外查询加载
        })
    return result

# === 分析任务相关 ===

@router.get("/projects/{project_id}/analyses", response_model=List[AnalysisPublic])
def list_analyses(
    project_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    project = session.get(Project, project_id)
    if not project or project.owner_id != current_user.id:
        raise HTTPException(404, "Project not found")
        
    return session.exec(
        select(Analysis)
        .where(Analysis.project_id == project_id)
        .order_by(Analysis.start_time.desc())
    ).all()

@router.post("/projects/{project_id}/analyses", response_model=AnalysisPublic)
def run_analysis(
    project_id: uuid.UUID,
    payload: AnalysisCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    project = session.get(Project, project_id)
    if not project or project.owner_id != current_user.id:
        raise HTTPException(404, "Project not found")
        
    # 创建记录
    analysis = Analysis(
        project_id=project_id,
        workflow=payload.workflow,
        params_json=payload.params_json,
        status="pending",
        sample_sheet_id=payload.sample_sheet_id # 如果指定了
    )
    session.add(analysis)
    session.commit()
    session.refresh(analysis)
    
    # 异步调用 Celery
    run_workflow_task.delay(str(analysis.id))
    
    return analysis

@router.get("/analyses/{analysis_id}/log")
def get_analysis_log(
    analysis_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    analysis = session.get(Analysis, analysis_id)
    if not analysis:
        raise HTTPException(404, "Analysis not found")
        
    if not analysis.work_dir:
        return {"log": "Waiting for execution..."}
        
    log_path = os.path.join(analysis.work_dir, "analysis.log")
    if os.path.exists(log_path):
        with open(log_path, "r") as f:
            return {"log": f.read()}
    return {"log": "Log file not found."}

@router.get("/analyses/{analysis_id}/report")
def get_analysis_report(
    analysis_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    analysis = session.get(Analysis, analysis_id)
    if not analysis:
        raise HTTPException(404, "Analysis not found")
        
    # 路径规则：workspace/{id}/results/multiqc/multiqc_report.html
    report_path = os.path.join(
        workflow_service.base_work_dir, 
        str(analysis.id), 
        "results", "multiqc", "multiqc_report.html"
    )
    
    if not os.path.exists(report_path):
        raise HTTPException(404, "Report not generated yet")
        
    return FileResponse(report_path)