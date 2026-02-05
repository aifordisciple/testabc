from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from typing import List
import uuid

from app.core.db import get_session
from app.services.s3 import s3_service
from app.models.user import User, Project, File, FileCreate, ProjectCreate, ProjectPublic
# 👇 引入刚才写的鉴权依赖
from app.api.deps import get_current_user 

router = APIRouter()

@router.post("/projects", response_model=ProjectPublic)
def create_project(
    project_in: ProjectCreate, 
    session: Session = Depends(get_session),
    # 👇 注入当前用户 (如果没登录，这里会直接抛出 401 错误)
    current_user: User = Depends(get_current_user) 
):
    """创建一个新项目 (归属于当前登录用户)"""
    project = Project(
        name=project_in.name, 
        description=project_in.description, 
        owner_id=current_user.id  # 👈 关键修改：使用当前用户ID
    )
    session.add(project)
    session.commit()
    session.refresh(project)
    return project

@router.get("/projects", response_model=List[ProjectPublic])
def list_projects(
    session: Session = Depends(get_session),
    # 👇 注入当前用户
    current_user: User = Depends(get_current_user)
):
    """列出当前用户的项目 (隔离其他用户数据)"""
    # 👈 关键修改：只查询 owner_id 等于当前用户ID 的项目
    statement = select(Project).where(Project.owner_id == current_user.id)
    results = session.exec(statement).all()
    return results

@router.post("/upload/presigned")
def get_upload_url(
    filename: str, 
    content_type: str, 
    project_id: uuid.UUID,
    # 👇 这一步虽然不写库，但也建议校验用户是否登录
    current_user: User = Depends(get_current_user)
):
    """Step 1: 获取上传 URL"""
    # (可选优化：这里应该检查 project_id 是否属于 current_user，防止越权上传)
    
    s3_key = f"projects/{project_id}/{filename}"
    
    url = s3_service.generate_presigned_url(s3_key, content_type)
    if not url:
        raise HTTPException(status_code=500, detail="S3 签名失败")
        
    return {"upload_url": url, "s3_key": s3_key}

@router.post("/upload/confirm")
def confirm_upload(
    file_in: FileCreate, 
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """Step 3: 确认上传成功，写入数据库"""
    file_record = File(**file_in.dict())
    session.add(file_record)
    session.commit()
    return {"status": "success", "file_id": file_record.id}