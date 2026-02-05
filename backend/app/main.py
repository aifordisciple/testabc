from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.core.config import settings
from app.core.db import init_db
from app.api.routes import auth, files, workflow # 👈 1. 导入 workflow

# === 生命周期管理 ===
@asynccontextmanager
async def lifespan(app: FastAPI):
    print("🚀 Autonome System Starting...")
    try:
        init_db()
        print("✅ Database initialized successfully.")
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

# === CORS 配置 (万能模式) ===
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
# 👇 2. 注册 Workflow 路由
app.include_router(workflow.router, prefix=f"{settings.API_V1_STR}/workflow", tags=["Workflow"])

@app.get("/")
def root():
    return {"message": "Welcome to Autonome API", "status": "operational"}