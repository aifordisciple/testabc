from sqlmodel import SQLModel, Field, Relationship
from typing import Optional, List
from datetime import datetime
import uuid
from app.models.user import User


# =======================
# 流程模版模型 (WorkflowTemplate)
# =======================
class WorkflowTemplateBase(SQLModel):
    name: str = Field(index=True, unique=True)
    description: Optional[str] = None
    
    # 分类系统
    category: str = Field(default="Analysis", index=True) # e.g. "Analysis", "Utility"
    subcategory: Optional[str] = Field(default=None)    # e.g. "RNA-Seq", "QC"
    
    # 执行相关
    script_path: str # 对应 pipelines/ 下的目录名，如 "rnaseq_qc"
    default_container: Optional[str] = None # 默认 Docker 镜像
    
    # 参数定义 (JSON Schema)
    # 示例: { "properties": { "threads": { "type": "integer", "default": 4 } } }
    params_schema: str = Field(default="{}") 

class WorkflowTemplate(WorkflowTemplateBase, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    # 权限控制：是否仅管理员可见，或者公开
    is_public: bool = Field(default=True)

class WorkflowTemplateCreate(WorkflowTemplateBase):
    pass

class WorkflowTemplateUpdate(SQLModel):
    name: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    subcategory: Optional[str] = None
    script_path: Optional[str] = None
    params_schema: Optional[str] = None
    is_public: Optional[bool] = None

class WorkflowTemplatePublic(WorkflowTemplateBase):
    id: uuid.UUID
    is_public: bool