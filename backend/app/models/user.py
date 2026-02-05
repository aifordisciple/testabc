from sqlmodel import SQLModel, Field, Relationship
from typing import Optional, List
from datetime import datetime
import uuid

# =======================
# 0. 关联表 (Many-to-Many Link)
# =======================
class ProjectFileLink(SQLModel, table=True):
    project_id: uuid.UUID = Field(foreign_key="project.id", primary_key=True)
    file_id: uuid.UUID = Field(foreign_key="file.id", primary_key=True)
    added_at: datetime = Field(default_factory=datetime.utcnow)

# =======================
# 1. 用户模型 (User)
# =======================
class UserBase(SQLModel):
    email: str = Field(unique=True, index=True)
    full_name: Optional[str] = None
    is_active: bool = Field(default=True)

class User(UserBase, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    hashed_password: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    projects: List["Project"] = Relationship(back_populates="owner")
    # 用户依然是文件的所有者，无论文件在哪个项目里
    uploaded_files: List["File"] = Relationship(back_populates="uploader")

class UserCreate(UserBase):
    password: str

class UserPublic(UserBase):
    id: int
    created_at: datetime

class Token(SQLModel):
    access_token: str
    token_type: str

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
    
    owner: Optional[User] = Relationship(back_populates="projects")
    
    # M2M 关系：通过关联表链接文件
    files: List["File"] = Relationship(back_populates="projects", link_model=ProjectFileLink)

class ProjectCreate(ProjectBase):
    pass

class ProjectPublic(ProjectBase):
    id: uuid.UUID
    created_at: datetime
    owner_id: int
    name: str
    description: Optional[str]

# =======================
# 3. 文件模型 (File)
# =======================
class FileBase(SQLModel):
    filename: str
    size: int
    content_type: str
    metadata_json: Optional[str] = Field(default="{}")
    is_directory: bool = Field(default=False) # 👈 新增：是否为文件夹

class File(FileBase, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    
    # S3 Key 只有文件有，文件夹可以是 None 或空字符串
    s3_key: Optional[str] = Field(default=None, unique=True) 
    
    uploader_id: int = Field(foreign_key="user.id")
    uploaded_at: datetime = Field(default_factory=datetime.utcnow)
    
    # 👈 新增：父目录指针 (自关联)
    parent_id: Optional[uuid.UUID] = Field(default=None, foreign_key="file.id")
    
    # 关系
    projects: List[Project] = Relationship(back_populates="files", link_model=ProjectFileLink)
    uploader: Optional[User] = Relationship(back_populates="uploaded_files")
    
    # 👈 新增：子文件/子文件夹关系 (方便级联查询，虽然后面我们主要用 parent_id 查)
    children: List["File"] = Relationship(
        sa_relationship_kwargs={
            "cascade": "all", # 如果删了父目录，逻辑上子节点怎么处理？通常需要手动处理，这里先不自动级联删除以免误删
            "remote_side": "File.id"
        }
    )

class FileCreate(FileBase):
    s3_key: Optional[str] = None
    project_id: uuid.UUID
    parent_id: Optional[uuid.UUID] = None # 👈 上传时指定父目录

class FilePublic(FileBase):
    id: uuid.UUID
    s3_key: Optional[str]
    uploaded_at: datetime
    parent_id: Optional[uuid.UUID]