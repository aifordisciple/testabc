from sqlmodel import SQLModel, Field
from sqlalchemy import Column
from pgvector.sqlalchemy import Vector
from typing import Optional, List
import uuid
from datetime import datetime

class PublicDataset(SQLModel, table=True):
    __tablename__ = "public_dataset"
    
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    accession: str = Field(index=True, unique=True, description="e.g., GSE12345")
    title: str
    summary: str
    
    organism: Optional[str] = None
    disease_state: Optional[str] = None
    sample_count: int = 0
    url: Optional[str] = None
    
    structured_metadata: str = "{}"
    
    # 👇 终极修复：去掉 Vector() 里的数字限制。让数据库自适应任意维度的向量！
    embedding: List[float] = Field(sa_column=Column(Vector))
    
    created_at: datetime = Field(default_factory=datetime.utcnow)