from celery import Celery
from sqlmodel import Session
import uuid

from app.core.config import settings
from app.core.db import engine
from app.services.workflow_service import workflow_service

# 1. 初始化 Celery 应用
# 注意：这里的名称 'app.worker' 必须与 docker-compose command 中的一致
celery_app = Celery(
    "worker",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND
)

# 2. 配置 Celery
celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
)

# 3. 定义异步任务
@celery_app.task(name="run_workflow_task", acks_late=True)
def run_workflow_task(analysis_id: str):
    """
    Celery 任务：执行生信分析流程
    注意：Celery 任务运行在独立进程中，必须创建新的数据库会话
    """
    print(f"🚀 [Celery] Starting task for Analysis ID: {analysis_id}")
    
    try:
        # 手动管理 Session 生命周期
        with Session(engine) as session:
            # 将字符串 ID 转回 UUID
            analysis_uuid = uuid.UUID(analysis_id)
            
            # 调用核心业务逻辑
            workflow_service.run_pipeline(session, analysis_uuid)
            
        return f"Analysis {analysis_id} completed successfully."
        
    except Exception as e:
        print(f"❌ [Celery] Task failed: {str(e)}")
        # 实际生产中这里可以调用 session 更新 Analysis 状态为 failed
        raise e