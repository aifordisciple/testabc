from fastapi import APIRouter, Depends, HTTPException, Body, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from sqlmodel import Session, select
from sqlalchemy import func
from typing import List, Optional
import uuid
import os
import shutil
import mimetypes
import asyncio
from pydantic import BaseModel

from app.core.db import get_session
from app.api.deps import get_current_user
from app.models.user import (
    User, Project, File,
    SampleSheet, SampleSheetCreate, SampleSheetPublic,
    Sample, SampleCreate, SamplePublic, SampleFileLink,
    Analysis, AnalysisCreate, AnalysisPublic
)
from app.worker import run_workflow_task
from app.services.workflow_service import workflow_service

router = APIRouter()

# =======================
# Global Endpoints (no project_id)
# =======================

@router.get("/analyses", response_model=List[AnalysisPublic])
def list_all_analyses(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
    limit: int = 100
):
    """List all analyses across all projects for current user"""
    user_projects = session.exec(
        select(Project.id).where(Project.owner_id == current_user.id)
    ).all()
    
    if not user_projects:
        return []
    
    analyses = session.exec(
        select(Analysis)
        .where(Analysis.project_id.in_(user_projects))
        .order_by(Analysis.start_time.desc())
        .limit(limit)
    ).all()
    
    return analyses


# =======================
# Sample Sheet Management

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

    r1_file = session.get(File, sample_in.r1_file_id)
    if not r1_file:
        raise HTTPException(400, "R1 file not found")
    
    link_r1 = SampleFileLink(sample_id=sample.id, file_id=r1_file.id, file_role="R1")
    session.add(link_r1)

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
    payload: AnalysisRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    project = session.get(Project, project_id)
    if not project or project.owner_id != current_user.id:
        raise HTTPException(404, "Project not found")

    # 🔒 安全机制：限制每个用户的并发任务数量 (默认最大2个并发)
    MAX_CONCURRENT_TASKS = int(os.getenv("MAX_CONCURRENT_TASKS", "2"))

    active_tasks = session.exec(
        select(func.count(Analysis.id))
        .join(Project, Project.id == Analysis.project_id)
        .where(Project.owner_id == current_user.id)
        .where(Analysis.status.in_(["pending", "running"]))
    ).one()

    if active_tasks >= MAX_CONCURRENT_TASKS:
        raise HTTPException(
            status_code=429,  # 429 Too Many Requests
            detail=f"Resource Limit Reached: You have {active_tasks} active tasks. You can only run a maximum of {MAX_CONCURRENT_TASKS} concurrent tasks. Please wait for existing tasks to finish."
        )

    # 通过检查，提交任务
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
        
    log_dir = analysis.work_dir if analysis.work_dir else os.path.join(workflow_service.base_work_dir, str(analysis.id))
    log_path = os.path.join(log_dir, "analysis.log")
    
    if os.path.exists(log_path):
        with open(log_path, "r", encoding="utf-8", errors="replace") as f:
            return {"log": f.read()}
            
    return {"log": "Log file waiting to be created..."}

@router.websocket("/analyses/{analysis_id}/ws/log")
async def websocket_analysis_log(
    websocket: WebSocket,
    analysis_id: uuid.UUID,
    session: Session = Depends(get_session)
):
    """
    通过 WebSocket 实时推送 analysis.log 内容
    """
    await websocket.accept()

    analysis = session.get(Analysis, analysis_id)
    if not analysis:
        await websocket.send_text("Error: Analysis not found.\n")
        await websocket.close()
        return

    base_dir = analysis.work_dir if analysis.work_dir else os.path.join(workflow_service.base_work_dir, str(analysis.id))
    log_path = os.path.join(base_dir, "analysis.log")

    try:
        wait_count = 0
        while not os.path.exists(log_path):
            if wait_count == 0:
                await websocket.send_text("Waiting for log file to be created...\n")
            await asyncio.sleep(1)
            wait_count += 1
            if wait_count > 120:
                await websocket.send_text("Timeout waiting for log file.\n")
                await websocket.close()
                return

        with open(log_path, "r", encoding="utf-8", errors="replace") as f:
            while True:
                line = f.readline()
                if not line:
                    await asyncio.sleep(0.5)
                    continue
                await websocket.send_text(line)

    except WebSocketDisconnect:
        print(f"Client disconnected from log stream: {analysis_id}")
    except Exception as e:
        print(f"WebSocket Log Error: {str(e)}")
        try:
            await websocket.send_text(f"\n[Error reading log: {str(e)}]\n")
            await websocket.close()
        except:
            pass

@router.get("/analyses/{analysis_id}/report")
def get_analysis_report(
    analysis_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    analysis = session.get(Analysis, analysis_id)
    if not analysis:
        raise HTTPException(404, "Analysis not found")
    
    base_dir = analysis.work_dir if analysis.work_dir else os.path.join(workflow_service.base_work_dir, str(analysis.id))
    results_dir = os.path.join(base_dir, "results")
    
    if not os.path.exists(results_dir):
         old_report = os.path.join(base_dir, "results", "multiqc", "multiqc_report.html")
         if os.path.exists(old_report):
             return FileResponse(old_report)
         raise HTTPException(404, "Results directory not found")

    candidates = []
    for root, dirs, files in os.walk(results_dir):
        for file in files:
            if file.lower().endswith(('.html', '.pdf', '.png', '.jpg', '.svg')):
                candidates.append(os.path.join(root, file))
    
    if not candidates:
        raise HTTPException(404, "No report files found in results.")

    def sort_key(path):
        ext = os.path.splitext(path)[1].lower()
        if ext == '.html': return 0
        if ext == '.pdf': return 1
        return 2
    
    candidates.sort(key=sort_key)
    report_path = candidates[0]
    
    media_type, _ = mimetypes.guess_type(report_path)
    if not media_type:
        media_type = "application/octet-stream"
        
    return FileResponse(report_path, media_type=media_type, filename=os.path.basename(report_path))

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

    if not os.path.exists(zip_file_path):
        shutil.make_archive(
            base_name=zip_base_name,
            format="zip",
            root_dir=results_dir
        )
    
    filename = f"results_{analysis.id}_download.zip"
    return FileResponse(zip_file_path, media_type="application/zip", filename=filename)

@router.post("/analyses/{analysis_id}/stop")
def stop_analysis(
    analysis_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """停止正在运行或等待中的任务"""
    analysis = session.get(Analysis, analysis_id)
    if not analysis:
        raise HTTPException(404, "Analysis not found")
    
    project = session.get(Project, analysis.project_id)
    if not project or project.owner_id != current_user.id:
        raise HTTPException(403, "Permission denied")
    
    if analysis.status not in ["pending", "running"]:
        raise HTTPException(400, f"Cannot stop task with status '{analysis.status}'")
    
    if analysis.pid:
        try:
            import signal
            os.kill(analysis.pid, signal.SIGTERM)
            print(f"[Stop Analysis] Sent SIGTERM to PID {analysis.pid}", flush=True)
        except ProcessLookupError:
            print(f"[Stop Analysis] Process {analysis.pid} not found", flush=True)
        except Exception as e:
            print(f"[Stop Analysis] Error killing process: {e}", flush=True)
    
    analysis.status = "stopped"
    from datetime import datetime
    analysis.end_time = datetime.utcnow()
    session.add(analysis)
    session.commit()
    
    return {"status": "stopped", "message": "Task has been stopped"}

@router.delete("/analyses/{analysis_id}")
def delete_analysis(
    analysis_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """删除任务记录及其工作目录"""
    analysis = session.get(Analysis, analysis_id)
    if not analysis:
        raise HTTPException(404, "Analysis not found")
    
    project = session.get(Project, analysis.project_id)
    if not project or project.owner_id != current_user.id:
        raise HTTPException(403, "Permission denied")
    
    if analysis.status in ["pending", "running"]:
        raise HTTPException(400, "Cannot delete a running task. Please stop it first.")
    
    work_dir = analysis.work_dir if analysis.work_dir else os.path.join(workflow_service.base_work_dir, str(analysis.id))
    if os.path.exists(work_dir):
        try:
            shutil.rmtree(work_dir)
            print(f"[Delete Analysis] Removed work directory: {work_dir}", flush=True)
        except Exception as e:
            print(f"[Delete Analysis] Warning: Could not remove work directory: {e}", flush=True)
    
    session.delete(analysis)
    session.commit()
    
    return {"status": "deleted", "message": "Task has been deleted"}