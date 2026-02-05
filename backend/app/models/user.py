from sqlmodel import SQLModel, Field, Relationship  # <--- 关键修复：导入 Relationship
from typing import Optional, List
from datetime import datetime
import uuid

# =======================
# 1. 用户模型 (User)
# =======================
class UserBase(SQLModel):
    email: str = Field(unique=True, index=True, description="用户邮箱，用于登录")
    full_name: Optional[str] = Field(default=None, description="用户全名")
    is_active: bool = Field(default=True, description="账户是否激活")

class User(UserBase, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    hashed_password: str = Field(description="加密后的密码 hash")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    # 关系定义：用户拥有多个项目
    # 使用字符串 "Project" 引用下文定义的类，避免未定义错误
    projects: List["Project"] = Relationship(back_populates="owner")

class UserCreate(UserBase):
    password: str = Field(min_length=8, description="密码长度至少8位")

class UserPublic(UserBase):
    id: int
    created_at: datetime

class Token(SQLModel):
    access_token: str
    token_type: str = "bearer"

# =======================
# 2. 项目模型 (Project)
# =======================
class ProjectBase(SQLModel):
    name: str = Field(index=True)
    description: Optional[str] = None

class Project(ProjectBase, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    owner_id: int = Field(foreign_key="user.id")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    # 关系定义：项目属于一个用户，拥有多个文件
    owner: Optional[User] = Relationship(back_populates="projects")
    files: List["File"] = Relationship(back_populates="project")

class ProjectCreate(ProjectBase):
    pass

class ProjectPublic(ProjectBase):
    id: uuid.UUID
    created_at: datetime
    owner_id: int

# =======================
# 3. 文件模型 (File)
# =======================
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
    
    # 关系定义：文件属于一个项目
    project: Optional[Project] = Relationship(back_populates="files")

class FileCreate(FileBase):
    project_id: uuid.UUID
    s3_key: str