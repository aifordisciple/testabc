import os
from sqlmodel import SQLModel, create_engine, Session
from sqlalchemy import text

from app.models.user import User, Project, File, SampleSheet, Sample, SampleFileLink, Analysis
from app.models.bio import WorkflowTemplate
from app.models.knowledge import PublicDataset
from app.models.conversation import Conversation, ConversationMessage 

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    f"postgresql://{os.getenv('POSTGRES_USER')}:{os.getenv('POSTGRES_PASSWORD')}@{os.getenv('DB_HOST', 'db')}:5432/{os.getenv('POSTGRES_DB')}"
)

engine = create_engine(DATABASE_URL, echo=False)

def run_migrations():
    """运行数据库迁移，添加缺失的列"""
    with Session(engine) as session:
        try:
            session.exec(text("ALTER TABLE workflowtemplate ADD COLUMN embedding vector"))
            print("✅ Added 'embedding' column to workflowtemplate", flush=True)
        except Exception as e:
            if "already exists" in str(e).lower() or "duplicate" in str(e).lower():
                print("ℹ️ Column 'embedding' already exists", flush=True)
            else:
                print(f"⚠️ Could not add 'embedding' column: {e}", flush=True)
        
        try:
            session.exec(text("ALTER TABLE workflowtemplate ADD COLUMN usage_count INTEGER DEFAULT 0"))
            print("✅ Added 'usage_count' column to workflowtemplate", flush=True)
        except Exception as e:
            if "already exists" in str(e).lower() or "duplicate" in str(e).lower():
                print("ℹ️ Column 'usage_count' already exists", flush=True)
            else:
                print(f"⚠️ Could not add 'usage_count' column: {e}", flush=True)
        
        session.commit()

def init_db():
    with Session(engine) as session:
        session.exec(text("CREATE EXTENSION IF NOT EXISTS vector;"))
        session.commit()
    
    SQLModel.metadata.create_all(engine)
    
    run_migrations()

def get_session():
    with Session(engine) as session:
        yield session