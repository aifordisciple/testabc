from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select, SQLModel  # <--- 已修复：导入 SQLModel
from typing import List, Optional
import uuid
from sqlalchemy import func # 👈 新增这一行！用于聚合查询

from app.core.db import get_session
from app.services.s3 import s3_service
from app.models.user import (
    User, Project, File, ProjectFileLink,
    FileCreate, ProjectCreate, ProjectPublic, FilePublic
)
from app.api.deps import get_current_user 

router = APIRouter()

# =======================
# Project API (项目管理)
# =======================

@router.post("/projects", response_model=ProjectPublic)
def create_project(
    project_in: ProjectCreate, 
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

@router.get("/projects", response_model=List[ProjectPublic])
def list_projects(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    statement = select(Project).where(Project.owner_id == current_user.id).order_by(Project.created_at.desc())
    results = session.exec(statement).all()
    return results

@router.get("/projects/{project_id}", response_model=ProjectPublic)
def get_project_detail(
    project_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """获取单个项目详情"""
    project = session.get(Project, project_id)
    if not project or project.owner_id != current_user.id:
        raise HTTPException(status_code=404, detail="Project not found")
    return project

# =======================
# Folder API (文件夹管理)
# =======================

@router.post("/projects/{project_id}/folders")
def create_folder(
    project_id: uuid.UUID,
    folder_name: str, 
    parent_id: Optional[uuid.UUID] = None,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """创建逻辑文件夹"""
    # 验证项目权限
    project = session.get(Project, project_id)
    if not project or project.owner_id != current_user.id:
        raise HTTPException(404, "Project not found")

    # 创建文件夹记录 (S3 Key 为 None)
    folder = File(
        filename=folder_name,
        size=0,
        content_type="application/x-directory",
        is_directory=True,
        uploader_id=current_user.id,
        parent_id=parent_id,
        s3_key=None 
    )
    session.add(folder)
    session.commit()
    session.refresh(folder)

    # 关联到项目
    link = ProjectFileLink(project_id=project_id, file_id=folder.id)
    session.add(link)
    session.commit()
    
    return {"status": "created", "folder": folder}

# =======================
# File API (文件管理)
# =======================

@router.get("/projects/{project_id}/files")
def list_project_files(
    project_id: uuid.UUID,
    folder_id: Optional[uuid.UUID] = None, 
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """
    列出指定项目下的文件。
    - 根目录模式：只显示显式关联到项目的文件/文件夹。
    - 子目录模式：如果文件夹已关联，则显示其下所有内容（动态共享）。
    """
    # 1. 验证项目基础权限
    project = session.get(Project, project_id)
    if not project or project.owner_id != current_user.id:
        raise HTTPException(status_code=404, detail="Project not found")
    
    breadcrumbs = []
    
    if folder_id:
        # === 进入文件夹模式 ===
        
        # A. 核心检查：这个文件夹本身是否属于该项目？
        # (这是安全关键点：防止用户通过 URL 遍历访问未授权的文件夹)
        folder_link = session.exec(
            select(ProjectFileLink)
            .where(ProjectFileLink.project_id == project_id)
            .where(ProjectFileLink.file_id == folder_id)
        ).first()
        
        if not folder_link:
             raise HTTPException(status_code=404, detail="Folder not linked to this project")
             
        # B. 查询内容：既然持有文件夹，就隐式持有其内容
        # 直接查 File 表，不再需要 Join ProjectFileLink
        statement = (
            select(File)
            .where(File.parent_id == folder_id)
            .order_by(File.is_directory.desc(), File.uploaded_at.desc())
        )
        
        # C. 构建面包屑 (向上递归查找路径)
        current = folder_id
        while current:
            f = session.get(File, current)
            if f:
                breadcrumbs.insert(0, {"id": f.id, "name": f.filename})
                current = f.parent_id
            else:
                break
                
    else:
        # === 根目录模式 ===
        
        # 必须严格 Join 关联表，只显示显式共享到根目录的项
        statement = (
            select(File)
            .join(ProjectFileLink, File.id == ProjectFileLink.file_id)
            .where(ProjectFileLink.project_id == project_id)
            .where(File.parent_id == None) # 只看根目录
            .order_by(File.is_directory.desc(), File.uploaded_at.desc())
        )

    files = session.exec(statement).all()
    return {"files": files, "breadcrumbs": breadcrumbs}

@router.post("/upload/presigned")
def get_upload_url(
    filename: str, 
    content_type: str, 
    project_id: uuid.UUID,
    current_user: User = Depends(get_current_user)
):
    # 构造 S3 Key: users/{user_id}/{unique_filename}
    # 策略：文件扁平化存储在 User 目录下，目录结构由数据库 parent_id 维护
    unique_name = f"{uuid.uuid4().hex[:8]}_{filename}"
    s3_key = f"users/{current_user.id}/{unique_name}"
    
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
    """确认上传：创建文件记录 + 关联到项目"""
    
    # 1. 创建 File 记录
    file_record = File(
        filename=file_in.filename,
        size=file_in.size,
        content_type=file_in.content_type,
        s3_key=file_in.s3_key,
        uploader_id=current_user.id,
        metadata_json=file_in.metadata_json,
        parent_id=file_in.parent_id, # 支持上传到指定文件夹
        is_directory=False
    )
    session.add(file_record)
    session.commit()
    session.refresh(file_record)
    
    # 2. 创建关联 (Link)
    link = ProjectFileLink(
        project_id=file_in.project_id,
        file_id=file_record.id
    )
    session.add(link)
    session.commit()
    
    return {"status": "success", "file_id": file_record.id}

@router.get("/files/{file_id}/download")
def get_download_url(
    file_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """获取下载链接 (GET Presigned URL)"""
    file_record = session.get(File, file_id)
    if not file_record:
        raise HTTPException(status_code=404, detail="File not found")
    
    if file_record.is_directory:
        raise HTTPException(status_code=400, detail="Cannot download a directory")

    # 简单鉴权：uploader 或 linked project owner
    # MVP: 仅检查 uploader
    if file_record.uploader_id != current_user.id:
         raise HTTPException(status_code=403, detail="Permission denied")

    # 生成 GET 链接
    url = s3_service.generate_presigned_url(file_record.s3_key, file_record.content_type, method='get_object')
    return {"download_url": url}

# ... 放在 File API 区域 ...

@router.get("/usage")
def get_storage_usage(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """获取当前用户的存储空间使用情况"""
    
    # 1. 计算总使用量 (聚合查询)
    # select sum(size) from file where uploader_id = current_user.id
    statement = select(func.sum(File.size)).where(File.uploader_id == current_user.id)
    total_bytes = session.exec(statement).first()
    
    # 如果没有文件，total_bytes 会是 None，转为 0
    used = total_bytes if total_bytes else 0
    
    # 2. 设定配额 (MVP阶段先硬编码，比如 10GB)
    # 未来可以做到 User 表里，给 VIP 用户更多空间
    limit = 10 * 1024 * 1024 * 1024 # 10 GB
    
    return {
        "used_bytes": used, 
        "limit_bytes": limit,
        "percentage": round((used / limit) * 100, 2)
    }

# =======================
# File Operations (操作)
# =======================

@router.delete("/projects/{project_id}/files/{file_id}")
def remove_file_from_project(
    project_id: uuid.UUID,
    file_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """从项目中移除文件 (解除关联，不物理删除文件)"""
    project = session.get(Project, project_id)
    if not project or project.owner_id != current_user.id:
        raise HTTPException(status_code=404, detail="Project not found")
    
    link = session.get(ProjectFileLink, (project_id, file_id))
    if not link:
        raise HTTPException(status_code=404, detail="File not linked to this project")
    
    session.delete(link)
    session.commit()
    
    return {"status": "removed", "detail": "File unlinked from project"}

@router.delete("/files/{file_id}")
def delete_file_permanently(
    file_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """彻底删除文件 (物理删除)"""
    file_record = session.get(File, file_id)
    if not file_record:
        raise HTTPException(status_code=404, detail="File not found")
    
    if file_record.uploader_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only uploader can delete file permanently")

    # 1. 如果是文件，删除 S3 对象
    if not file_record.is_directory and file_record.s3_key:
        s3_service.delete_file(file_record.s3_key)

    # 2. 清理所有关联
    links = session.exec(select(ProjectFileLink).where(ProjectFileLink.file_id == file_id)).all()
    for link in links:
        session.delete(link)
        
    session.delete(file_record)
    session.commit()
    
    return {"status": "deleted", "detail": "File permanently deleted"}

# --- 重命名 ---
class FileNameUpdate(SQLModel):
    new_name: str

@router.patch("/files/{file_id}/rename")
def rename_file(
    file_id: uuid.UUID,
    name_update: FileNameUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    file_record = session.get(File, file_id)
    if not file_record:
        raise HTTPException(status_code=404, detail="File not found")
        
    file_record.filename = name_update.new_name
    session.add(file_record)
    session.commit()
    session.refresh(file_record)
    return file_record

# --- 移动文件 (修改父目录) ---
class MoveFileRequest(SQLModel):
    target_folder_id: Optional[uuid.UUID]

@router.patch("/files/{file_id}/move")
def move_file(
    file_id: uuid.UUID,
    move_req: MoveFileRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    file_record = session.get(File, file_id)
    if not file_record:
        raise HTTPException(404, "File not found")
        
    if file_record.is_directory and move_req.target_folder_id == file_id:
         raise HTTPException(400, "Cannot move folder into itself")

    file_record.parent_id = move_req.target_folder_id
    session.add(file_record)
    session.commit()
    return {"status": "moved"}

# --- 关联到其他项目 ---
class LinkFileRequest(SQLModel):
    target_project_id: uuid.UUID

@router.post("/files/{file_id}/link")
def link_file_to_project(
    file_id: uuid.UUID,
    link_req: LinkFileRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """将现有文件添加到另一个项目"""
    file_record = session.get(File, file_id)
    if not file_record: 
        raise HTTPException(404, "File not found")
        
    target_project = session.get(Project, link_req.target_project_id)
    if not target_project or target_project.owner_id != current_user.id:
        raise HTTPException(403, "Target project not found or permission denied")
        
    existing_link = session.get(ProjectFileLink, (link_req.target_project_id, file_id))
    if existing_link:
        return {"status": "already_linked"}
        
    new_link = ProjectFileLink(project_id=link_req.target_project_id, file_id=file_id)
    session.add(new_link)
    session.commit()
    
    return {"status": "linked"}