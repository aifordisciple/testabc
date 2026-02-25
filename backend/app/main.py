# backend/app/main.py

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from sqlmodel import select

from app.core.config import settings
from app.core.db import init_db, get_session
# 👇 修复点 1：清理了错误重复的 conversations 导入
from app.api.routes import auth, files, workflow, admin, ai, knowledge
from app.models.bio import WorkflowTemplate

# === 数据预置 (Seeding) ===
def seed_initial_workflows():
    from app.core.db import engine
    from sqlmodel import Session
    
    with Session(engine) as session:
        existing = session.exec(select(WorkflowTemplate).where(WorkflowTemplate.script_path == "rnaseq_qc")).first()
        if not existing:
            print("🌱 Seeding initial workflow: RNA-Seq QC")
            qc_flow = WorkflowTemplate(
                name="RNA-Seq QC Pipeline",
                description="Standard FastQC + MultiQC pipeline for raw sequencing data.",
                category="Analysis",
                subcategory="Quality Control",
                script_path="rnaseq_qc",
                params_schema="""
                {
                    "type": "object",
                    "properties": {
                        "skip_multiqc": {
                            "type": "boolean",
                            "title": "Skip MultiQC",
                            "default": false
                        },
                        "fastqc_args": {
                            "type": "string",
                            "title": "Extra FastQC Arguments",
                            "default": "-q"
                        }
                    }
                }
                """
            )
            session.add(qc_flow)
            session.commit()

# === 生命周期管理 ===
@asynccontextmanager
async def lifespan(app: FastAPI):
    print("🚀 Autonome System Starting...")
    try:
        init_db()
        print("✅ Database initialized successfully.")
        try:
            seed_initial_workflows()
        except Exception as e:
            print(f"⚠️ Seeding failed: {e}")
    except Exception as e:
        print(f"❌ Database initialization failed: {e}")
    yield
    print("🛑 Autonome System Shutting Down...")

# === 初始化 FastAPI ===
app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    lifespan=lifespan
)

# === CORS 配置 ===
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=".*", 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# === 注册路由 ===
app.include_router(auth.router, prefix=f"{settings.API_V1_STR}/auth", tags=["Authentication"])
app.include_router(files.router, prefix=f"{settings.API_V1_STR}/files", tags=["Files"])
app.include_router(workflow.router, prefix=f"{settings.API_V1_STR}/workflow", tags=["Workflow"])
app.include_router(admin.router, prefix=f"{settings.API_V1_STR}/admin", tags=["Admin"])
app.include_router(ai.router, prefix=f"{settings.API_V1_STR}/ai", tags=["AI"]) 
app.include_router(knowledge.router, prefix=f"{settings.API_V1_STR}/knowledge", tags=["Knowledge"])

@app.get("/")
def root():
    return {"message": "Welcome to Autonome API", "status": "operational"}