import os
from sqlmodel import SQLModel, create_engine, Session
from sqlalchemy import text

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
    
    with Session(engine) as session:
        try:
            session.exec(text("ALTER TABLE workflowtemplate ADD COLUMN IF NOT EXISTS created_by INTEGER;"))
            session.exec(text("ALTER TABLE workflowtemplate ADD COLUMN IF NOT EXISTS review_status VARCHAR;"))
            session.exec(text("ALTER TABLE workflowtemplate ADD COLUMN IF NOT EXISTS usage_count INTEGER DEFAULT 0;"))
            session.commit()
        except Exception as e:
            print(f"Migration warning (can be ignored if columns exist): {e}")
            session.rollback()

def get_session():
    with Session(engine) as session:
        yield session
