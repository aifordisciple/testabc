import os
from sqlmodel import SQLModel, create_engine, Session
from sqlalchemy import text

# 导入所有模型以便 metadata 能够捕捉并自动建表
from app.models.user import User, Project, File, SampleSheet, Sample, SampleFileLink, Analysis
from app.models.bio import WorkflowTemplate
# 👇 引入我们刚才新建的知识库模型
from app.models.knowledge import PublicDataset 

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    f"postgresql://{os.getenv('POSTGRES_USER')}:{os.getenv('POSTGRES_PASSWORD')}@{os.getenv('DB_HOST', 'db')}:5432/{os.getenv('POSTGRES_DB')}"
)

# 生产环境可关闭 echo
engine = create_engine(DATABASE_URL, echo=False)

def init_db():
    # 1. 必须先开启 pgvector 扩展插件，才能创建包含 Vector 类型的表
    with Session(engine) as session:
        session.exec(text("CREATE EXTENSION IF NOT EXISTS vector;"))
        session.commit()
        
    # 2. 自动创建所有定义的 SQLModel 表（包括新增的 public_dataset）
    SQLModel.metadata.create_all(engine)

def get_session():
    with Session(engine) as session:
        yield session