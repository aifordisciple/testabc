from sqlmodel import SQLModel, Field, Relationship
from typing import Optional, List
from datetime import datetime
import uuid

# 用户表
class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    email: str = Field(unique=True, index=True)
    hashed_password: str
    is_active: bool = True
    projects: List["Project"] = Relationship(back_populates="owner")

# 项目表
class Project(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    name: str
    description: Optional[str] = None
    owner_id: int = Field(foreign_key="user.id")
    owner: User = Relationship(back_populates="projects")
    files: List["File"] = Relationship(back_populates="project")
    created_at: datetime = Field(default_factory=datetime.utcnow)

# 文件表 (虚拟文件系统核心)
class File(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    filename: str
    s3_key: str  # 在 MinIO 中的实际路径，例如: projects/{project_id}/{filename}
    size: int    # 字节
    content_type: str # e.g., 'application/gzip'
    project_id: uuid.UUID = Field(foreign_key="project.id")
    project: Project = Relationship(back_populates="files")
    uploaded_at: datetime = Field(default_factory=datetime.utcnow)
