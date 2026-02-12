from fastapi import APIRouter, Depends, HTTPException, Body
from fastapi.responses import FileResponse
from sqlmodel import Session, select
from typing import List, Optional
import uuid
import os
import shutil
import mimetypes
from pydantic import BaseModel

from app.core.db import get_session
from app.api.deps import get_current_user
from app.models.user import (
    User, Project, File,
    SampleSheet, SampleSheetCreate, SampleSheetPublic,
    Sample, SampleCreate, SamplePublic, SampleFileLink,
    Analysis, AnalysisCreate, AnalysisPublic
)
# 这里的 import 路径可能根据你的项目结构有所不同，保持你原来的引用方式
# 如果你原来的代码里是 app.worker，请保持 app.worker
# 如果你使用了 app.core.celery_app，请替换
# 这里暂时保留原来的引用，但通常建议用 celery_app.send_task 避免循环引用
from app.worker import run_workflow_task
from app.services.workflow_service import workflow_service # 引入 workflow_service 以获取路径配置

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

    links = session.exec(select(SampleFileLink).where(SampleFileLink.sample_id == sample_id)).all()
    for link in links:
        session.delete(link)

    session.delete(sample)
    session.commit()
    return {"status": "deleted"}

# =======================
# Analysis Management
# =======================

# 👇 1. 新增 Pydantic 模型，解决参数验证错误
class AnalysisRequest(BaseModel):
    workflow: str
    sample_sheet_id: Optional[uuid.UUID] = None
    params_json: Optional[str] = "{}"

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
    # 👇 2. 使用 AnalysisRequest 替代 AnalysisCreate，支持 sample_sheet_id 为空
    payload: AnalysisRequest,
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
    
    # 异步执行
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
        
    # 如果 work_dir 还没生成，使用 workflow_service 推断路径
    log_dir = analysis.work_dir if analysis.work_dir else os.path.join(workflow_service.base_work_dir, str(analysis.id))
    log_path = os.path.join(log_dir, "analysis.log")
    
    if os.path.exists(log_path):
        with open(log_path, "r", encoding="utf-8", errors="replace") as f:
            return {"log": f.read()}
            
    return {"log": "Log file waiting to be created..."}

# 👇 3. 升级 Report 接口：智能查找结果文件
@router.get("/analyses/{analysis_id}/report")
def get_analysis_report(
    analysis_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    analysis = session.get(Analysis, analysis_id)
    if not analysis:
        raise HTTPException(404, "Analysis not found")
    
    # 获取结果目录
    base_dir = analysis.work_dir if analysis.work_dir else os.path.join(workflow_service.base_work_dir, str(analysis.id))
    results_dir = os.path.join(base_dir, "results")
    
    if not os.path.exists(results_dir):
         # 尝试回退到旧的 multiqc 路径（兼容旧代码）
         old_report = os.path.join(base_dir, "results", "multiqc", "multiqc_report.html")
         if os.path.exists(old_report):
             return FileResponse(old_report)
         raise HTTPException(404, "Results directory not found")

    # 智能搜索策略
    candidates = []
    for root, dirs, files in os.walk(results_dir):
        for file in files:
            if file.lower().endswith(('.html', '.pdf', '.png', '.jpg', '.svg')):
                candidates.append(os.path.join(root, file))
    
    if not candidates:
        raise HTTPException(404, "No report files found in results.")

    # 优先级排序
    def sort_key(path):
        ext = os.path.splitext(path)[1].lower()
        if ext == '.html': return 0
        if ext == '.pdf': return 1
        return 2
    
    candidates.sort(key=sort_key)
    report_path = candidates[0]
    
    # 自动推断 MIME 类型，确保浏览器预览
    media_type, _ = mimetypes.guess_type(report_path)
    if not media_type:
        media_type = "application/octet-stream"
        
    return FileResponse(report_path, media_type=media_type, filename=os.path.basename(report_path))

# 👇 4. 新增 Download 接口：打包下载
@router.get("/analyses/{analysis_id}/download_results")
def download_analysis_results(
    analysis_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    analysis = session.get(Analysis, analysis_id)
    if not analysis:
        raise HTTPException(404, "Analysis not found")
        
    run_dir = analysis.work_dir if analysis.work_dir else os.path.join(workflow_service.base_work_dir, str(analysis.id))
    results_dir = os.path.join(run_dir, "results")
    
    if not os.path.exists(results_dir) or not os.listdir(results_dir):
        raise HTTPException(404, "Results directory is empty or missing.")

    zip_base_name = os.path.join(run_dir, f"results_{analysis.id}")
    zip_file_path = zip_base_name + ".zip"

    # 如果压缩包不存在，则创建
    if not os.path.exists(zip_file_path):
        shutil.make_archive(
            base_name=zip_base_name,
            format="zip",
            root_dir=results_dir
        )
    
    filename = f"results_{analysis.id}_download.zip"
    return FileResponse(zip_file_path, media_type="application/zip", filename=filename)