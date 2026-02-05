# backend/app/models/user.py

from sqlmodel import SQLModel, Field, Relationship
from typing import Optional, List
from datetime import datetime
import uuid

# =======================
# 0. 关联表 (Links)
# =======================

# 项目-文件 多对多关联
class ProjectFileLink(SQLModel, table=True):
    project_id: uuid.UUID = Field(foreign_key="project.id", primary_key=True)
    file_id: uuid.UUID = Field(foreign_key="file.id", primary_key=True)
    added_at: datetime = Field(default_factory=datetime.utcnow)

# 样本-文件 多对多关联 (带角色，如 R1/R2)
class SampleFileLink(SQLModel, table=True):
    sample_id: uuid.UUID = Field(foreign_key="sample.id", primary_key=True)
    file_id: uuid.UUID = Field(foreign_key="file.id", primary_key=True)
    file_role: str = Field(default="R1") # R1, R2, BAM, etc.

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
# 2. 样本表/实验单模型 (SampleSheet) - 新增
# =======================
class SampleSheetBase(SQLModel):
    name: str = Field(index=True)
    description: Optional[str] = None

class SampleSheet(SampleSheetBase, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    project_id: uuid.UUID = Field(foreign_key="project.id")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    project: "Project" = Relationship(back_populates="sample_sheets")
    samples: List["Sample"] = Relationship(back_populates="sample_sheet")
    analyses: List["Analysis"] = Relationship(back_populates="sample_sheet")

class SampleSheetCreate(SampleSheetBase):
    project_id: uuid.UUID

class SampleSheetPublic(SampleSheetBase):
    id: uuid.UUID
    project_id: uuid.UUID
    created_at: datetime

# =======================
# 3. 项目模型 (Project)
# =======================
class ProjectBase(SQLModel):
    name: str = Field(index=True)
    description: Optional[str] = None

class Project(ProjectBase, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    owner_id: int = Field(foreign_key="user.id")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    owner: Optional[User] = Relationship(back_populates="projects")
    files: List["File"] = Relationship(back_populates="projects", link_model=ProjectFileLink)
    
    sample_sheets: List[SampleSheet] = Relationship(back_populates="project")
    analyses: List["Analysis"] = Relationship(back_populates="project")

class ProjectCreate(ProjectBase):
    pass

class ProjectPublic(ProjectBase):
    id: uuid.UUID
    created_at: datetime
    owner_id: int
    name: str
    description: Optional[str]

# =======================
# 4. 文件模型 (File)
# =======================
class FileBase(SQLModel):
    filename: str
    size: int
    content_type: str
    metadata_json: Optional[str] = Field(default="{}")
    is_directory: bool = Field(default=False)

class File(FileBase, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    s3_key: Optional[str] = Field(default=None, unique=True)
    uploader_id: int = Field(foreign_key="user.id")
    uploaded_at: datetime = Field(default_factory=datetime.utcnow)
    
    parent_id: Optional[uuid.UUID] = Field(default=None, foreign_key="file.id")
    
    projects: List[Project] = Relationship(back_populates="files", link_model=ProjectFileLink)
    uploader: Optional[User] = Relationship(back_populates="uploaded_files")
    
    # 样本关联：指向 Sample.files
    samples: List["Sample"] = Relationship(back_populates="files", link_model=SampleFileLink)

class FileCreate(FileBase):
    s3_key: Optional[str] = None
    project_id: uuid.UUID
    parent_id: Optional[uuid.UUID] = None

class FilePublic(FileBase):
    id: uuid.UUID
    s3_key: Optional[str]
    uploaded_at: datetime
    parent_id: Optional[uuid.UUID]

# =======================
# 5. 样本模型 (Sample)
# =======================
class SampleBase(SQLModel):
    name: str
    group: str = Field(default="control") 
    replicate: int = Field(default=1)     
    meta_json: str = Field(default="{}")

class Sample(SampleBase, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    
    sample_sheet_id: uuid.UUID = Field(foreign_key="samplesheet.id")
    
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    sample_sheet: SampleSheet = Relationship(back_populates="samples")
    
    # 🔧 修正：back_populates 必须指向 File 模型中定义的属性名 "samples"
    files: List[File] = Relationship(back_populates="samples", link_model=SampleFileLink)

class SampleCreate(SampleBase):
    sample_sheet_id: uuid.UUID
    r1_file_id: uuid.UUID
    r2_file_id: Optional[uuid.UUID] = None

class SamplePublic(SampleBase):
    id: uuid.UUID
    sample_sheet_id: uuid.UUID
    files: List[FilePublic]

# =======================
# 6. 分析任务模型 (Analysis)
# =======================
class AnalysisBase(SQLModel):
    workflow: str 
    params_json: str = Field(default="{}")

class Analysis(AnalysisBase, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    project_id: uuid.UUID = Field(foreign_key="project.id")
    
    sample_sheet_id: Optional[uuid.UUID] = Field(default=None, foreign_key="samplesheet.id")

    status: str = Field(default="pending") 
    nextflow_run_name: Optional[str] = None 
    pid: Optional[int] = None 
    
    work_dir: Optional[str] = None 
    out_dir: Optional[str] = None 
    
    start_time: datetime = Field(default_factory=datetime.utcnow)
    end_time: Optional[datetime] = None
    
    project: Project = Relationship(back_populates="analyses")
    sample_sheet: Optional[SampleSheet] = Relationship(back_populates="analyses")

class AnalysisCreate(AnalysisBase):
    project_id: uuid.UUID
    sample_sheet_id: Optional[uuid.UUID] = None

class AnalysisPublic(AnalysisBase):
    id: uuid.UUID
    status: str
    start_time: datetime
    sample_sheet_id: Optional[uuid.UUID]