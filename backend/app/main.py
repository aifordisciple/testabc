# backend/app/main.py

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from sqlmodel import select, func
from app.core.config import settings
from app.core.db import init_db, get_session
from app.api.routes import auth, files, workflow, admin, ai, knowledge, conversations
from app.api.routes import plugins as plugins_router
from app.api.routes import orchestration as orchestration_router
from app.api.routes import community as community_router
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
    import sys
    import logging
    
    logging.basicConfig(level=logging.INFO)
    logger = logging.getLogger(__name__)
    
    print("🚀 Autonome System Starting...")
    try:
        init_db()
        print("✅ Database initialized successfully.")
    except Exception as e:
        print(f"❌ Database initialization failed: {e}")
        logger.critical("Database connection failed. Exiting...")
        sys.exit(1)
        
    try:
        seed_initial_workflows()
    except Exception as e:
        print(f"⚠️ Seeding failed: {e}")
    
    # Check WorkflowTemplate count and warn if empty
    try:
        from app.core.db import engine
        from sqlmodel import Session as CheckSession
        with CheckSession(engine) as check_session:
            template_count = check_session.exec(select(func.count(WorkflowTemplate.id))).one()
            if template_count == 0:
                print("⚠️ WARNING: No WorkflowTemplates found in database!")
                print("⚠️ Bio-Copilot tool matching will not work properly.")
                print("⚠️ Please add workflow templates via Admin panel or API.")
            else:
                print(f"✅ Found {template_count} WorkflowTemplate(s) in database.")
    except Exception as e:
        print(f"⚠️ Template check failed: {e}")
    
    # Initialize plugins
    try:
        from app.core.db import engine
        from sqlmodel import Session
        from app.plugins import register_builtin_plugins, plugin_manager
        
        with Session(engine) as session:
            register_builtin_plugins(plugin_manager, session)
        
        import asyncio
        asyncio.run(plugin_manager.initialize())
        print(f"✅ Loaded {len(plugin_manager.get_all())} plugins")
    except Exception as e:
        print(f"⚠️ Plugin initialization failed: {e}")
        
    yield
    
    print("🛑 Autonome System Shutting Down...")
    try:
        import asyncio
        asyncio.run(plugin_manager.shutdown())
    except Exception as e:
        print(f"⚠️ Plugin shutdown failed: {e}")
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
        
        # Check WorkflowTemplate count and warn if empty
        try:
            from app.core.db import engine
            from sqlmodel import Session as CheckSession
            with CheckSession(engine) as check_session:
                template_count = check_session.exec(select(func.count(WorkflowTemplate.id))).one()
                if template_count == 0:
                    print("⚠️ WARNING: No WorkflowTemplates found in database!")
                    print("⚠️ Bio-Copilot tool matching will not work properly.")
                    print("⚠️ Please add workflow templates via Admin panel or API.")
                else:
                    print(f"✅ Found {template_count} WorkflowTemplate(s) in database.")
        except Exception as e:
            print(f"⚠️ Template check failed: {e}")
        # Initialize plugins
        try:
            from app.core.db import engine
            from sqlmodel import Session
            from app.plugins import register_builtin_plugins, plugin_manager
            
            with Session(engine) as session:
                register_builtin_plugins(plugin_manager, session)
            
            import asyncio
            asyncio.run(plugin_manager.initialize())
            print(f"✅ Loaded {len(plugin_manager.get_all())} plugins")
        except Exception as e:
            print(f"⚠️ Plugin initialization failed: {e}")
            
    except Exception as e:
        print(f"❌ Database initialization failed: {e}")
    yield
    print("🛑 Autonome System Shutting Down...")
    try:
        import asyncio
        asyncio.run(plugin_manager.shutdown())
    except Exception as e:
        print(f"⚠️ Plugin shutdown failed: {e}")

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

# === Global Exception Handlers ===
from fastapi import Request, status
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
import traceback

@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail, "status_code": exc.status_code}
    )

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={"detail": exc.errors(), "body": str(exc.body) if exc.body else None}
    )

@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    traceback.print_exc()
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "Internal server error", "message": str(exc)[:200]}
    )

# === 注册路由 ===
app.include_router(auth.router, prefix=f"{settings.API_V1_STR}/auth", tags=["Authentication"])
app.include_router(files.router, prefix=f"{settings.API_V1_STR}/files", tags=["Files"])
app.include_router(workflow.router, prefix=f"{settings.API_V1_STR}/workflow", tags=["Workflow"])
app.include_router(admin.router, prefix=f"{settings.API_V1_STR}/admin", tags=["Admin"])
app.include_router(ai.router, prefix=f"{settings.API_V1_STR}/ai", tags=["AI"]) 
app.include_router(knowledge.router, prefix=f"{settings.API_V1_STR}/knowledge", tags=["Knowledge"])
app.include_router(conversations.router, prefix=f"{settings.API_V1_STR}", tags=["Conversations"])
app.include_router(plugins_router.router, prefix=f"{settings.API_V1_STR}/system", tags=["System"])
app.include_router(orchestration_router.router, prefix=f"{settings.API_V1_STR}/ai/orchestration", tags=["Orchestration"])
app.include_router(community_router.router, prefix=f"{settings.API_V1_STR}/community", tags=["Community"])



@app.get("/")
def root():
    return {"message": "Welcome to Autonome API", "status": "operational"}