from fastapi import APIRouter, Depends
from app.models.user import User
from app.api.deps import get_current_user
from app.worker import test_celery

router = APIRouter()

@router.post("/test-celery", status_code=201)
def run_test_task(
    msg: str = "Hello Nextflow",
    current_user: User = Depends(get_current_user)
):
    """
    触发一个后台测试任务
    """
    # 使用 .delay() 异步调用
    task = test_celery.delay(msg)
    return {"task_id": task.id, "status": "Task submitted"}