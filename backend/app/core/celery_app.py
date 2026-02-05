import os
from celery import Celery

# 从环境变量获取 Redis 地址，如果没设置则使用默认值
# 注意：因为 Python 跑在宿主机，而 Redis 跑在 Docker，
# 宿主机访问 Docker 里的 Redis 通常用 localhost:6379 (前提是 docker-compose 暴露了端口)
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6378/0")

celery_app = Celery("worker", broker=REDIS_URL, backend=REDIS_URL)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],  # Ignore other content
    result_serializer="json",
    timezone="Asia/Shanghai",
    enable_utc=True,
)