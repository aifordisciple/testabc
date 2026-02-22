import os
from celery import Celery
from celery.schedules import crontab

redis_host = os.getenv("REDIS_HOST", "redis")
broker_url = f"redis://{redis_host}:6379/0"

celery_app = Celery(
    "autonome",
    broker=broker_url,
    backend=broker_url,
    include=["app.worker"]
)

# 基础配置
celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
)

# 👇 新增：配置定时任务 (Celery Beat)
celery_app.conf.beat_schedule = {
    "daily-geo-sync": {
        "task": "sync_recent_geo_datasets",
        # 每天凌晨 2 点执行 (可以根据需求改成 crontab(minute="*/30") 测试每30分钟运行一次)
        "schedule": crontab(minute=0, hour=2), 
        "args": (150,) # 每次抓取最新发布的 15 个数据集
    }
}