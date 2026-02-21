from fastapi import APIRouter, Depends, HTTPException, UploadFile, File as FastAPIFile, Form, Body
from fastapi.responses import FileResponse
from sqlmodel import Session, select, SQLModel
from typing import List, Optional
import uuid
import os
import shutil
import traceback
import re
from datetime import datetime
from sqlalchemy import func

from app.core.db import get_session
from app.models.user import User, File, Project, ProjectFileLink
from app.api.deps import get_current_user

router = APIRouter()

UPLOAD_ROOT = os.getenv("UPLOAD_ROOT", "/data/uploads")

class ProjectUpdate(SQLModel):
    name: Optional[str] = None
    description: Optional[str] = None

class LinkFileRequest(SQLModel):
    target_project_id: uuid.UUID

# =======================
# Security Helper
# =======================
def sanitize_filename(filename: str) -> str:
    """
    [安全过滤] 清洗文件名，防止路径穿越攻击 (Path Traversal)。
    允许中文字符，但过滤掉所有可能构成目录层级的危险符号。
    """
    if not filename:
        return "unnamed_file"
    
    # 1. 强制提取 basename，丢弃任何路径前缀 (如 ../../../etc/passwd -> passwd)
    filename = os.path.basename(filename.replace('\\', '/'))
    # 2. 移除所有系统敏感的特殊字符 (保留中文、字母、数字、点、下划线、短横线)
    filename = re.sub(r'[\\/*?:"<>|]', '', filename)
    # 3. 彻底移除潜在的相对路径符号
    filename = filename.replace('..', '')
    filename = filename.strip()
    
    return filename if filename else "unnamed_file"


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
    
    links = session.exec(select(ProjectFileLink).where(ProjectFileLink.project_id == project_id)).all()
    for link in links:
        session.delete(link)
    
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
    project = session.get(Project, project_id)
    if not project or project.owner_id != current_user.id:
        raise HTTPException(status_code=404, detail="Project not found")

    if parent_id:
        parent = session.get(File, parent_id)
        if not parent:
            raise HTTPException(404, "Parent folder not found")
        if not parent.is_directory:
             raise HTTPException(400, "Parent is not a directory")
    
    # 🔒 安全过滤
    safe_folder_name = sanitize_filename(folder_name)
    
    statement = (
        select(File)
        .join(ProjectFileLink)
        .where(ProjectFileLink.project_id == project_id)
        .where(File.parent_id == parent_id)
        .where(File.filename == safe_folder_name)
        .where(File.is_directory == True)
    )
    existing = session.exec(statement).first()
    
    if existing:
         raise HTTPException(400, "Folder already exists")

    virtual_key = f"{project_id}/_folders/{uuid.uuid4()}/"
    
    new_folder = File(
        filename=safe_folder_name,
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
    
    link = ProjectFileLink(project_id=project_id, file_id=new_folder.id)
    session.add(link)
    session.commit()
    
    return new_folder

# =======================
# File Management
# =======================

@router.post("/projects/{project_id}/files/chunk")
def upload_file_chunk(
    project_id: uuid.UUID,
    file: UploadFile = FastAPIFile(...),         
    filename: str = Form(...),                   
    chunk_index: int = Form(...),                
    total_chunks: int = Form(...),               
    upload_id: str = Form(...),                  
    parent_id: Optional[uuid.UUID] = Form(None), 
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    try:
        project = session.get(Project, project_id)
        if not project or project.owner_id != current_user.id:
            raise HTTPException(status_code=404, detail="Project not found")

        # 🔒 安全过滤
        safe_filename = sanitize_filename(filename)

        # 准备临时目录存放分片
        tmp_dir = os.path.join(UPLOAD_ROOT, "tmp", str(project_id), sanitize_filename(upload_id))
        os.makedirs(tmp_dir, exist_ok=True)
        
        # 保存当前分片
        chunk_path = os.path.join(tmp_dir, f"chunk_{chunk_index}")
        with open(chunk_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        # 判断是否为最后一个分片
        if chunk_index == total_chunks - 1:
            print(f"DEBUG: All chunks received. Merging {safe_filename}...")
            
            # 准备最终存储路径
            save_dir = os.path.join(UPLOAD_ROOT, str(project_id))
            os.makedirs(save_dir, exist_ok=True)
            final_file_path = os.path.join(save_dir, safe_filename)
            
            # 合并文件
            with open(final_file_path, "wb") as outfile:
                for i in range(total_chunks):
                    c_path = os.path.join(tmp_dir, f"chunk_{i}")
                    with open(c_path, "rb") as infile:
                        shutil.copyfileobj(infile, outfile)
            
            # 删除临时分片目录
            shutil.rmtree(tmp_dir, ignore_errors=True)
            
            file_size = os.path.getsize(final_file_path)
            relative_path = os.path.join(str(project_id), safe_filename)

            # 更新或创建数据库记录
            existing_file = session.exec(
                select(File).where(File.s3_key == relative_path)
            ).first()

            if existing_file:
                existing_file.size = file_size
                existing_file.uploaded_at = datetime.utcnow()
                session.add(existing_file)
                session.commit()
                session.refresh(existing_file)
                db_file = existing_file
            else:
                db_file = File(
                    filename=safe_filename,
                    size=file_size,
                    content_type="application/octet-stream",
                    s3_key=relative_path,
                    uploader_id=current_user.id,
                    parent_id=parent_id
                )
                session.add(db_file)
                session.commit()
                session.refresh(db_file)

            link = session.exec(
                select(ProjectFileLink)
                .where(ProjectFileLink.project_id == project_id)
                .where(ProjectFileLink.file_id == db_file.id)
            ).first()
            
            if not link:
                session.add(ProjectFileLink(project_id=project_id, file_id=db_file.id))
                session.commit()

            return {"status": "completed", "file": db_file}

        return {"status": "uploading", "chunk_index": chunk_index}

    except Exception as e:
        print(f"ERROR in chunk upload: {str(e)}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Upload chunk failed: {str(e)}")


@router.post("/projects/{project_id}/files")
def upload_file_legacy(
    project_id: uuid.UUID,
    file: UploadFile = FastAPIFile(...),
    parent_id: Optional[uuid.UUID] = Form(None),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    try:
        project = session.get(Project, project_id)
        if not project or project.owner_id != current_user.id:
            raise HTTPException(status_code=404, detail="Project not found")

        # 🔒 安全过滤
        safe_filename = sanitize_filename(file.filename)

        save_dir = os.path.join(UPLOAD_ROOT, str(project_id))
        os.makedirs(save_dir, exist_ok=True)
        file_path = os.path.join(save_dir, safe_filename)
        
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        file_size = os.path.getsize(file_path)
        relative_path = os.path.join(str(project_id), safe_filename)

        existing_file = session.exec(select(File).where(File.s3_key == relative_path)).first()

        if existing_file:
            existing_file.size = file_size
            existing_file.uploaded_at = datetime.utcnow()
            session.add(existing_file)
            session.commit()
            session.refresh(existing_file)
            db_file = existing_file
        else:
            db_file = File(
                filename=safe_filename, size=file_size,
                content_type=file.content_type or "application/octet-stream",
                s3_key=relative_path, uploader_id=current_user.id, parent_id=parent_id
            )
            session.add(db_file)
            session.commit()
            session.refresh(db_file)

        link = session.exec(
            select(ProjectFileLink).where(ProjectFileLink.project_id == project_id).where(ProjectFileLink.file_id == db_file.id)
        ).first()
        if not link:
            session.add(ProjectFileLink(project_id=project_id, file_id=db_file.id))
            session.commit()
        return db_file
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")


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
    payload: dict = Body(...),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    new_name = payload.get("new_name")
    if not new_name:
        raise HTTPException(400, "New name required")
        
    # 🔒 安全过滤
    safe_new_name = sanitize_filename(new_name)
        
    file_rec = session.get(File, file_id)
    if not file_rec:
        raise HTTPException(404, "File not found")
    
    if file_rec.uploader_id != current_user.id:
        raise HTTPException(403, "Permission denied")
        
    file_rec.filename = safe_new_name
    session.add(file_rec)
    session.commit()
    return file_rec

@router.post("/files/{file_id}/link")
def link_file_to_project(
    file_id: uuid.UUID,
    link_req: LinkFileRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    target_project_id = link_req.target_project_id
    
    target_project = session.get(Project, target_project_id)
    if not target_project or target_project.owner_id != current_user.id:
        raise HTTPException(404, "Target project not found")

    source_file = session.get(File, file_id)
    if not source_file:
        raise HTTPException(404, "File not found")

    def _recursive_link(f_id: uuid.UUID, proj_id: uuid.UUID):
        existing_link = session.exec(
            select(ProjectFileLink)
            .where(ProjectFileLink.project_id == proj_id)
            .where(ProjectFileLink.file_id == f_id)
        ).first()
        
        if not existing_link:
            new_link = ProjectFileLink(project_id=proj_id, file_id=f_id)
            session.add(new_link)
        
        current_file = session.get(File, f_id)
        if current_file and current_file.is_directory:
            children = session.exec(select(File).where(File.parent_id == f_id)).all()
            for child in children:
                _recursive_link(child.id, proj_id)

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