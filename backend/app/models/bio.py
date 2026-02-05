from sqlmodel import SQLModel, Field, Relationship
from typing import Optional, List
from datetime import datetime
import uuid
from app.models.user import User

# === Project (项目) ===
class ProjectBase(SQLModel):
    name: str = Field(index=True)
    description: Optional[str] = None

class Project(ProjectBase, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    owner_id: int = Field(foreign_key="user.id")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    # 关系链接
    owner: Optional[User] = Relationship(back_populates="projects")
    files: List["File"] = Relationship(back_populates="project")

class ProjectCreate(ProjectBase):
    pass

class ProjectPublic(ProjectBase):
    id: uuid.UUID
    created_at: datetime
    owner_id: int

# === File (文件 - 虚拟文件系统 VFS) ===
class FileBase(SQLModel):
    filename: str
    size: int
    content_type: str
    # 生物学元数据 (如: {"sequencer": "Illumina", "organism": "Human"})
    metadata_json: Optional[str] = Field(default="{}", description="JSON string of metadata") 

class File(FileBase, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    s3_key: str = Field(unique=True)  # MinIO 中的实际路径
    project_id: uuid.UUID = Field(foreign_key="project.id")
    uploaded_at: datetime = Field(default_factory=datetime.utcnow)
    
    project: Optional[Project] = Relationship(back_populates="files")

class FileCreate(FileBase):
    project_id: uuid.UUID
    s3_key: str