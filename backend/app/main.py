from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.core.config import settings
from app.core.db import init_db
from app.api.routes import auth

from app.api.routes import auth, files  # <--- 导入 files

# === 生命周期管理 ===
@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    应用启动时执行：初始化数据库表结构
    应用关闭时执行：(暂无)
    """
    print("🚀 Autonome System Starting...")
    init_db()
    yield
    print("🛑 Autonome System Shutting Down...")

# === 初始化 FastAPI ===
app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    lifespan=lifespan
)

# === CORS 配置 (允许前端访问) ===
# 允许 localhost:3000 (Next.js) 跨域请求
origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
	"http://localhost:3001",    # <--- 新增这一行
    "http://127.0.0.1:3001",    # <--- 新增这一行 (保险起见)
    "http://113.44.66.210:3001",    # <--- 新增这一行 (保险起见)
]

app.add_middleware(
    CORSMiddleware,
    # allow_origins=origins,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# === 注册路由 ===
app.include_router(auth.router, prefix=f"{settings.API_V1_STR}/auth", tags=["Authentication"])
app.include_router(files.router, prefix=f"{settings.API_V1_STR}/files", tags=["Files"]) # <--- 注册

@app.get("/")
def root():
    return {"message": "Welcome to Autonome API", "status": "operational"}
