# backend/app/api/routes/workflow.py

from fastapi import APIRouter, Depends, HTTPException, Body
from sqlmodel import Session, select
from typing import List, Optional
import uuid
import os

from app.core.db import get_session
from app.api.deps import get_current_user
from app.models.user import (
    User, Project, File,
    SampleSheet, SampleSheetCreate, SampleSheetPublic,
    Sample, SampleCreate, SamplePublic, SampleFileLink,
    Analysis, AnalysisCreate, AnalysisPublic
)
from app.worker import run_workflow_task
# 暂时不需要 workflow_service，直到第三阶段

router = APIRouter()

# =======================
# Sample Sheet Management
# =======================

@router.post("/projects/{project_id}/sample_sheets", response_model=SampleSheetPublic)
def create_sample_sheet(
    project_id: uuid.UUID,
    sheet_in: SampleSheetCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    project = session.get(Project, project_id)
    if not project or project.owner_id != current_user.id:
        raise HTTPException(404, "Project not found")

    sheet = SampleSheet(
        name=sheet_in.name,
        description=sheet_in.description,
        project_id=project_id
    )
    session.add(sheet)
    session.commit()
    session.refresh(sheet)
    return sheet

@router.get("/projects/{project_id}/sample_sheets", response_model=List[SampleSheetPublic])
def list_sample_sheets(
    project_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    project = session.get(Project, project_id)
    if not project or project.owner_id != current_user.id:
        raise HTTPException(404, "Project not found")
    
    sheets = session.exec(select(SampleSheet).where(SampleSheet.project_id == project_id)).all()
    return sheets

@router.delete("/sample_sheets/{sheet_id}")
def delete_sample_sheet(
    sheet_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    sheet = session.get(SampleSheet, sheet_id)
    if not sheet:
        raise HTTPException(404, "Sample sheet not found")
    
    project = session.get(Project, sheet.project_id)
    if project.owner_id != current_user.id:
        raise HTTPException(403, "Permission denied")

    # 级联删除 Samples 会由数据库或 SQLModel 处理 (如果在 ORM 定义了 cascade)
    # 这里的 cascade="all, delete" 定义在 User.py 中，SQLAlchemy 会处理
    session.delete(sheet)
    session.commit()
    return {"status": "deleted"}

# =======================
# Sample Management
# =======================

@router.get("/sample_sheets/{sheet_id}/samples", response_model=List[SamplePublic])
def list_sheet_samples(
    sheet_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    sheet = session.get(SampleSheet, sheet_id)
    if not sheet:
         raise HTTPException(404, "Sample sheet not found")
         
    project = session.get(Project, sheet.project_id)
    if project.owner_id != current_user.id:
        raise HTTPException(403, "Permission denied")

    samples = session.exec(select(Sample).where(Sample.sample_sheet_id == sheet_id)).all()
    return samples

@router.post("/sample_sheets/{sheet_id}/samples", response_model=SamplePublic)
def add_sample(
    sheet_id: uuid.UUID,
    sample_in: SampleCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """
    添加样本并自动关联文件
    """
    sheet = session.get(SampleSheet, sheet_id)
    if not sheet:
        raise HTTPException(404, "Sample sheet not found")
    
    project = session.get(Project, sheet.project_id)
    if project.owner_id != current_user.id:
        raise HTTPException(403, "Permission denied")

    # 1. 创建 Sample 记录
    sample = Sample(
        name=sample_in.name,
        group=sample_in.group,
        replicate=sample_in.replicate,
        sample_sheet_id=sheet_id,
        meta_json=sample_in.meta_json
    )
    session.add(sample)
    session.commit()
    session.refresh(sample)

    # 2. 关联 R1 文件
    r1_file = session.get(File, sample_in.r1_file_id)
    if not r1_file:
        raise HTTPException(400, "R1 file not found")
    
    link_r1 = SampleFileLink(sample_id=sample.id, file_id=r1_file.id, file_role="R1")
    session.add(link_r1)

    # 3. 关联 R2 文件 (可选)
    if sample_in.r2_file_id:
        r2_file = session.get(File, sample_in.r2_file_id)
        if not r2_file:
             raise HTTPException(400, "R2 file not found")
        link_r2 = SampleFileLink(sample_id=sample.id, file_id=r2_file.id, file_role="R2")
        session.add(link_r2)
    
    session.commit()
    session.refresh(sample)
    
    return sample

@router.delete("/samples/{sample_id}")
def delete_sample(
    sample_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    sample = session.get(Sample, sample_id)
    if not sample:
        raise HTTPException(404, "Sample not found")
    
    sheet = session.get(SampleSheet, sample.sample_sheet_id)
    project = session.get(Project, sheet.project_id)
    if project.owner_id != current_user.id:
        raise HTTPException(403, "Permission denied")

    # 手动删除关联表记录
    links = session.exec(select(SampleFileLink).where(SampleFileLink.sample_id == sample_id)).all()
    for link in links:
        session.delete(link)

    session.delete(sample)
    session.commit()
    return {"status": "deleted"}

# =======================
# Analysis Management
# =======================

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
        
    analysis = Analysis(
        project_id=project_id,
        workflow=payload.workflow,
        params_json=payload.params_json,
        status="pending",
        sample_sheet_id=payload.sample_sheet_id
    )
    session.add(analysis)
    session.commit()
    session.refresh(analysis)
    
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
        
    # 临时硬编码路径，后续在 service 中统一
    report_path = os.path.join(
        "/data/workspace",  # 假设的基础路径，需与 worker 一致
        str(analysis.id), 
        "results", "multiqc", "multiqc_report.html"
    )
    
    if not os.path.exists(report_path):
        raise HTTPException(404, "Report not generated yet")
        
    return FileResponse(report_path)