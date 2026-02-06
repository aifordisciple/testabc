from fastapi import APIRouter, Depends, HTTPException, UploadFile, File as FastAPIFile, Form, Body
from fastapi.responses import FileResponse
from sqlmodel import Session, select, SQLModel
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

# === 内部模型 ===
class ProjectUpdate(SQLModel):
    name: Optional[str] = None
    description: Optional[str] = None

class LinkFileRequest(SQLModel):
    target_project_id: uuid.UUID

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

@router.patch("/projects/{project_id}", response_model=Project)
def update_project(
    project_id: uuid.UUID,
    project_update: ProjectUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    project = session.get(Project, project_id)
    if not project or project.owner_id != current_user.id:
        raise HTTPException(status_code=404, detail="Project not found")
    
    if project_update.name is not None:
        project.name = project_update.name
    if project_update.description is not None:
        project.description = project_update.description
        
    session.add(project)
    session.commit()
    session.refresh(project)
    return project

@router.delete("/projects/{project_id}")
def delete_project(
    project_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    project = session.get(Project, project_id)
    if not project or project.owner_id != current_user.id:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # 1. 删除项目关联的文件链接 (ProjectFileLink)
    links = session.exec(select(ProjectFileLink).where(ProjectFileLink.project_id == project_id)).all()
    for link in links:
        session.delete(link)
    
    # 2. 删除项目本身 (级联删除 SampleSheet/Analysis 会由 SQLAlchemy 处理)
    session.delete(project)
    session.commit()
    return {"status": "deleted"}

# =======================
# Folder Management
# =======================

@router.post("/projects/{project_id}/folders")
def create_folder(
    project_id: uuid.UUID,
    folder_name: str, 
    parent_id: Optional[uuid.UUID] = None,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    # 1. 验证权限
    project = session.get(Project, project_id)
    if not project or project.owner_id != current_user.id:
        raise HTTPException(status_code=404, detail="Project not found")

    # 2. 检查父目录
    if parent_id:
        parent = session.get(File, parent_id)
        if not parent:
            raise HTTPException(404, "Parent folder not found")
        if not parent.is_directory:
             raise HTTPException(400, "Parent is not a directory")
    
    # 3. 检查重名
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
# File Management
# =======================

@router.post("/upload")
def upload_file(
    project_id: uuid.UUID,
    file: UploadFile = FastAPIFile(...),
    parent_id: Optional[uuid.UUID] = Form(None),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    project = session.get(Project, project_id)
    if not project or project.owner_id != current_user.id:
        raise HTTPException(status_code=404, detail="Project not found")

    save_dir = os.path.join(UPLOAD_ROOT, str(project_id))
    os.makedirs(save_dir, exist_ok=True)
    
    file_path = os.path.join(save_dir, file.filename)
    
    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"File save failed: {str(e)}")

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
        # 递归列出所有文件 (非目录)
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
                
        statement = (
            select(File)
            .join(ProjectFileLink)
            .where(ProjectFileLink.project_id == project_id)
            .where(File.parent_id == folder_id)
            .order_by(File.is_directory.desc(), File.uploaded_at.desc())
        )
    else:
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
        
    if file_rec.s3_key and not file_rec.is_directory:
        file_path = os.path.join(UPLOAD_ROOT, file_rec.s3_key)
        if os.path.exists(file_path):
            try:
                os.remove(file_path)
            except OSError:
                pass 
    
    links = session.exec(select(ProjectFileLink).where(ProjectFileLink.file_id == file_id)).all()
    for link in links:
        session.delete(link)
        
    session.delete(file_rec)
    session.commit()
    return {"status": "deleted"}

@router.delete("/projects/{project_id}/files/{file_id}")
def remove_file_from_project(
    project_id: uuid.UUID,
    file_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """
    仅移除关联 (不物理删除文件)
    """
    project = session.get(Project, project_id)
    if not project or project.owner_id != current_user.id:
        raise HTTPException(403, "Permission denied")
        
    link = session.exec(
        select(ProjectFileLink)
        .where(ProjectFileLink.project_id == project_id)
        .where(ProjectFileLink.file_id == file_id)
    ).first()
    
    if link:
        session.delete(link)
        session.commit()
    
    return {"status": "unlinked"}

@router.patch("/files/{file_id}/rename")
def rename_file(
    file_id: uuid.UUID,
    payload: dict = Body(...), # { "new_name": "xxx" }
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    new_name = payload.get("new_name")
    if not new_name:
        raise HTTPException(400, "New name required")
        
    file_rec = session.get(File, file_id)
    if not file_rec:
        raise HTTPException(404, "File not found")
    
    if file_rec.uploader_id != current_user.id:
        raise HTTPException(403, "Permission denied")
        
    file_rec.filename = new_name
    session.add(file_rec)
    session.commit()
    return file_rec

# 👇 新增：文件共享 (递归关联)
@router.post("/files/{file_id}/link")
def link_file_to_project(
    file_id: uuid.UUID,
    link_req: LinkFileRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """
    将文件或文件夹分享到另一个项目。
    如果是文件夹，会递归分享其下所有子文件和子文件夹。
    """
    target_project_id = link_req.target_project_id
    
    # 1. 验证目标项目权限
    target_project = session.get(Project, target_project_id)
    if not target_project or target_project.owner_id != current_user.id:
        raise HTTPException(404, "Target project not found")

    # 2. 验证源文件
    source_file = session.get(File, file_id)
    if not source_file:
        raise HTTPException(404, "File not found")

    # 3. 递归关联函数
    def _recursive_link(f_id: uuid.UUID, proj_id: uuid.UUID):
        # 检查是否存在
        existing_link = session.exec(
            select(ProjectFileLink)
            .where(ProjectFileLink.project_id == proj_id)
            .where(ProjectFileLink.file_id == f_id)
        ).first()
        
        if not existing_link:
            new_link = ProjectFileLink(project_id=proj_id, file_id=f_id)
            session.add(new_link)
        
        # 如果是目录，递归查找子项
        current_file = session.get(File, f_id)
        if current_file and current_file.is_directory:
            children = session.exec(select(File).where(File.parent_id == f_id)).all()
            for child in children:
                _recursive_link(child.id, proj_id)

    # 4. 执行
    try:
        _recursive_link(file_id, target_project_id)
        session.commit()
    except Exception as e:
        session.rollback()
        raise HTTPException(500, f"Failed to link files: {str(e)}")

    return {"status": "linked"}

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