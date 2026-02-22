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
    url: str
    
    structured_metadata: str = "{}"
    
    # 👇 核心修改：适配 bge-m3，将向量维度改为 1024
    embedding: List[float] = Field(sa_column=Column(Vector(1024)))
    
    created_at: datetime = Field(default_factory=datetime.utcnow)