# backend/app/models/bio.py
from sqlmodel import SQLModel, Field
from sqlalchemy import Column
from pgvector.sqlalchemy import Vector
from typing import Optional, List
from datetime import datetime
import uuid

# =======================
# 流程/模块模版模型 (WorkflowTemplate)
# =======================
class WorkflowTemplateBase(SQLModel):
    name: str = Field(index=True, unique=True)
    description: Optional[str] = None
    
    # 分类
    category: str = Field(default="Analysis", index=True) 
    subcategory: Optional[str] = Field(default=None)    
    
    # ⚠️ 修复：将 type 改名为 workflow_type，避免与 Python 内置类型冲突
    # "PIPELINE": 完整流程 (默认)
    # "MODULE": 独立模块 (Process)
    workflow_type: str = Field(default="PIPELINE", index=True)

    # 兼容字段
    script_path: Optional[str] = None 
    
    # 核心字段
    source_code: Optional[str] = Field(default=None) 
    config_code: Optional[str] = Field(default=None) 
    
    # 参数定义
    params_schema: str = Field(default="{}") 
    
    # 可视化配置
    visual_config: Optional[str] = Field(default="{}")

class WorkflowTemplate(WorkflowTemplateBase, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    is_public: bool = Field(default=True)
    
    embedding: Optional[List[float]] = Field(
        default=None,
        sa_column=Column(Vector),
        description="流程描述的向量嵌入，用于语义匹配"
    )
    
    usage_count: int = Field(default=0, description="使用次数统计")

class WorkflowTemplateCreate(WorkflowTemplateBase):
    pass

class WorkflowTemplateUpdate(SQLModel):
    name: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    subcategory: Optional[str] = None
    workflow_type: Optional[str] = None # 👈 修改
    script_path: Optional[str] = None
    source_code: Optional[str] = None
    config_code: Optional[str] = None
    params_schema: Optional[str] = None
    visual_config: Optional[str] = None
    is_public: Optional[bool] = None

class WorkflowTemplatePublic(WorkflowTemplateBase):
    id: uuid.UUID
    is_public: bool
    updated_at: datetime