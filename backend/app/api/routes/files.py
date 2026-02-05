from fastapi import APIRouter, Depends, HTTPException, UploadFile, File as FastAPIFile, Form
from fastapi.responses import FileResponse
from sqlmodel import Session, select
from typing import List, Optional
import uuid
import os
import shutil
from datetime import datetime
from sqlalchemy import func

from app.core.db import get_session
from app.models.user import User, File, Project, ProjectFileLink
from app.api.deps import get_current_user

router = APIRouter()

# 从环境变量获取存储路径，默认为 /data/uploads (容器内路径)
UPLOAD_ROOT = os.getenv("UPLOAD_ROOT", "/data/uploads")

# =======================
# Project Management
# =======================

@router.post("/projects", response_model=Project)
def create_project(
    project_in: Project,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    project = Project(
        name=project_in.name,
        description=project_in.description,
        owner_id=current_user.id
    )
    session.add(project)
    session.commit()
    session.refresh(project)
    return project

@router.get("/projects", response_model=List[Project])
def list_projects(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    return session.exec(select(Project).where(Project.owner_id == current_user.id)).all()

@router.get("/projects/{project_id}", response_model=Project)
def get_project(
    project_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    project = session.get(Project, project_id)
    if not project or project.owner_id != current_user.id:
        raise HTTPException(status_code=404, detail="Project not found")
    return project

# =======================
# Folder Management (新增部分)
# =======================

@router.post("/projects/{project_id}/folders")
def create_folder(
    project_id: uuid.UUID,
    folder_name: str, 
    parent_id: Optional[uuid.UUID] = None,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """
    创建文件夹 (虚拟目录)
    """
    # 1. 验证权限
    project = session.get(Project, project_id)
    if not project or project.owner_id != current_user.id:
        raise HTTPException(status_code=404, detail="Project not found")

    # 2. 检查父目录 (如果有)
    if parent_id:
        parent = session.get(File, parent_id)
        if not parent:
            raise HTTPException(404, "Parent folder not found")
        if not parent.is_directory:
             raise HTTPException(400, "Parent is not a directory")
    
    # 3. 检查重名 (在同一级目录下)
    # 注意：这里需要通过 ProjectFileLink 关联查询，或者直接查 File 表如果 parent_id 确定
    # 简单起见，查该项目下同 parent_id 的同名文件夹
    statement = (
        select(File)
        .join(ProjectFileLink)
        .where(ProjectFileLink.project_id == project_id)
        .where(File.parent_id == parent_id)
        .where(File.filename == folder_name)
        .where(File.is_directory == True)
    )
    existing = session.exec(statement).first()
    
    if existing:
         raise HTTPException(400, "Folder already exists")

    # 4. 创建文件夹记录
    # s3_key 对于文件夹是虚拟的，生成一个唯一路径以满足 Unique 约束
    virtual_key = f"{project_id}/_folders/{uuid.uuid4()}/"
    
    new_folder = File(
        filename=folder_name,
        size=0,
        content_type="application/x-directory",
        is_directory=True,
        s3_key=virtual_key,
        uploader_id=current_user.id,
        parent_id=parent_id
    )
    session.add(new_folder)
    session.commit()
    session.refresh(new_folder)
    
    # 5. 关联到项目
    link = ProjectFileLink(project_id=project_id, file_id=new_folder.id)
    session.add(link)
    session.commit()
    
    return new_folder

# =======================
# File Management (Local Storage Version)
# =======================

@router.post("/upload")
def upload_file(
    project_id: uuid.UUID,
    file: UploadFile = FastAPIFile(...),
    parent_id: Optional[uuid.UUID] = Form(None),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """
    上传文件到本地存储
    """
    # 1. 验证权限
    project = session.get(Project, project_id)
    if not project or project.owner_id != current_user.id:
        raise HTTPException(status_code=404, detail="Project not found")

    # 2. 准备存储路径
    # 使用 project_id 作为子目录，隔离不同项目的文件
    save_dir = os.path.join(UPLOAD_ROOT, str(project_id))
    os.makedirs(save_dir, exist_ok=True)
    
    # 防止文件名冲突，简单处理直接使用文件名
    file_path = os.path.join(save_dir, file.filename)
    
    # 3. 流式写入磁盘
    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"File save failed: {str(e)}")

    # 4. 记录到数据库
    # s3_key 存储相对路径: project_id/filename
    relative_path = os.path.join(str(project_id), file.filename)
    
    file_size = os.path.getsize(file_path)

    db_file = File(
        filename=file.filename,
        size=file_size,
        content_type=file.content_type or "application/octet-stream",
        s3_key=relative_path,
        uploader_id=current_user.id,
        parent_id=parent_id
    )
    session.add(db_file)
    session.commit()
    session.refresh(db_file)

    # 5. 建立关联
    link = ProjectFileLink(project_id=project_id, file_id=db_file.id)
    session.add(link)
    session.commit()

    return db_file

@router.get("/files/{file_id}/download")
def download_file(
    file_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """
    下载文件 (直接从本地磁盘读取)
    """
    file_record = session.get(File, file_id)
    if not file_record:
        raise HTTPException(status_code=404, detail="File not found")
        
    if file_record.uploader_id != current_user.id:
        raise HTTPException(status_code=403, detail="Permission denied")

    if not file_record.s3_key:
        raise HTTPException(status_code=404, detail="File path missing in DB")
        
    file_path = os.path.join(UPLOAD_ROOT, file_record.s3_key)
    
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File object not found on disk")

    return { "download_url": f"/api/v1/files/download_proxy/{file_id}" }

@router.get("/download_proxy/{file_id}")
def download_proxy(
    file_id: uuid.UUID,
    session: Session = Depends(get_session)
):
    file_record = session.get(File, file_id)
    if not file_record:
        raise HTTPException(404, "File not found")
        
    file_path = os.path.join(UPLOAD_ROOT, file_record.s3_key)
    return FileResponse(file_path, filename=file_record.filename)

@router.get("/projects/{project_id}/files")
def list_project_files(
    project_id: uuid.UUID,
    folder_id: Optional[uuid.UUID] = None, 
    recursive: bool = False,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    project = session.get(Project, project_id)
    if not project or project.owner_id != current_user.id:
        raise HTTPException(status_code=404, detail="Project not found")
    
    breadcrumbs = []
    
    if recursive:
        statement = (
            select(File)
            .join(ProjectFileLink, File.id == ProjectFileLink.file_id)
            .where(ProjectFileLink.project_id == project_id)
            .where(File.is_directory == False)
            .order_by(File.uploaded_at.desc())
        )
        files = session.exec(statement).all()
        return {"files": files, "breadcrumbs": []}

    if folder_id:
        # 获取面包屑导航
        folder = session.get(File, folder_id)
        if not folder: 
             raise HTTPException(404, "Folder not found")
             
        current = folder_id
        while current:
            f = session.get(File, current)
            if f:
                breadcrumbs.insert(0, {"id": f.id, "name": f.filename})
                current = f.parent_id
            else:
                break
                
        # 查询文件夹内容
        statement = (
            select(File)
            .join(ProjectFileLink)
            .where(ProjectFileLink.project_id == project_id)
            .where(File.parent_id == folder_id)
            .order_by(File.is_directory.desc(), File.uploaded_at.desc())
        )
    else:
        # 查询根目录内容
        statement = (
            select(File)
            .join(ProjectFileLink)
            .where(ProjectFileLink.project_id == project_id)
            .where(File.parent_id == None)
            .order_by(File.is_directory.desc(), File.uploaded_at.desc())
        )

    files = session.exec(statement).all()
    return {"files": files, "breadcrumbs": breadcrumbs}

@router.delete("/files/{file_id}")
def delete_file(
    file_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    file_rec = session.get(File, file_id)
    if not file_rec:
        raise HTTPException(404, "File not found")
        
    if file_rec.uploader_id != current_user.id:
        raise HTTPException(403, "Permission denied")
        
    # 物理删除 (如果是文件)
    if file_rec.s3_key and not file_rec.is_directory:
        file_path = os.path.join(UPLOAD_ROOT, file_rec.s3_key)
        if os.path.exists(file_path):
            try:
                os.remove(file_path)
            except OSError:
                pass 
    
    # 数据库删除关联
    links = session.exec(select(ProjectFileLink).where(ProjectFileLink.file_id == file_id)).all()
    for link in links:
        session.delete(link)
        
    session.delete(file_rec)
    session.commit()
    return {"status": "deleted"}

@router.get("/usage")
def get_storage_usage(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    statement = select(func.sum(File.size)).where(File.uploader_id == current_user.id)
    total_bytes = session.exec(statement).first()
    used = total_bytes if total_bytes else 0
    limit = 10 * 1024 * 1024 * 1024 
    return {
        "used_bytes": used, 
        "limit_bytes": limit,
        "percentage": round((used / limit) * 100, 2)
    }