import uuid
import os
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session

from app.core.db import get_session
from app.api.deps import get_current_user
from app.models.user import User, Analysis, Project, TaskChain

router = APIRouter()


@router.get("/{task_id}")
def get_task_detail(
    task_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """获取任务的详细信息 (支持单步 Analysis 和多步 TaskChain)"""
    
    # 1. 尝试从单步分析任务 (Analysis) 中查找
    analysis = session.get(Analysis, task_id)
    if analysis:
        project = session.get(Project, analysis.project_id)
        if not project or project.owner_id != current_user.id:
            raise HTTPException(status_code=403, detail="Permission denied")
        
        return {
            "id": str(analysis.id),
            "type": "analysis",
            "project_id": str(analysis.project_id),
            "project_name": project.name,
            "workflow": analysis.workflow,
            "status": analysis.status,
            "start_time": analysis.start_time.isoformat() if analysis.start_time else None,
            "end_time": analysis.end_time.isoformat() if analysis.end_time else None,
            "params_json": analysis.params_json
        }
    
    # 2. 如果没找到，尝试从多步任务链 (TaskChain) 中查找
    chain = session.get(TaskChain, task_id)
    if chain:
        project = session.get(Project, chain.project_id)
        if not project or project.owner_id != current_user.id:
            raise HTTPException(status_code=403, detail="Permission denied")
            
        return {
            "id": str(chain.id),
            "type": "chain",
            "project_id": str(chain.project_id),
            "project_name": project.name,
            "status": chain.status,
            "strategy": chain.strategy,
            "current_step": chain.current_step,
            "total_steps": chain.total_steps,
            "created_at": chain.created_at.isoformat() if chain.created_at else None
        }
        
    # 都没找到才报 404
    raise HTTPException(status_code=404, detail="Task not found in database")


@router.get("/{task_id}/logs")
def get_task_logs(
    task_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """获取任务实时执行日志"""
    analysis = session.get(Analysis, task_id)
    if not analysis:
        raise HTTPException(status_code=404, detail="Analysis not found")
        
    project = session.get(Project, analysis.project_id)
    if not project or project.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Permission denied")
        
    # 获取后台日志文件的物理路径
    base_dir = analysis.work_dir if analysis.work_dir else os.path.join("/app/workspace", str(analysis.id))
    log_path = os.path.join(base_dir, "analysis.log")
    
    if not os.path.exists(log_path):
        return {"logs": "Waiting for log file to be created...\n"}
        
    try:
        with open(log_path, "r", encoding="utf-8", errors="replace") as f:
            # 截取最后 1000 行，防止巨量日志卡死前端
            lines = f.readlines()
            logs = "".join(lines[-1000:])
        return {"logs": logs}
    except Exception as e:
        return {"logs": f"Error reading logs: {str(e)}"}
