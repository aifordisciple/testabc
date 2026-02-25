import os
from sqlmodel import SQLModel, create_engine, Session
from sqlalchemy import text

from app.models.user import User, Project, File, SampleSheet, Sample, SampleFileLink, Analysis, CopilotMessage
from app.models.bio import WorkflowTemplate
from app.models.knowledge import PublicDataset

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    f"postgresql://{os.getenv('POSTGRES_USER')}:{os.getenv('POSTGRES_PASSWORD')}@{os.getenv('DB_HOST', 'db')}:5432/{os.getenv('POSTGRES_DB')}"
)

engine = create_engine(DATABASE_URL, echo=False)

def init_db():
    with Session(engine) as session:
        session.exec(text("CREATE EXTENSION IF NOT EXISTS vector;"))
        session.commit()
    
    SQLModel.metadata.create_all(engine)

def get_session():
    with Session(engine) as session:
        yield session
