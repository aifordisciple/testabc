import os
import json
import uuid
import subprocess
from celery import Celery
from celery.schedules import crontab
from sqlmodel import Session

from app.core.config import settings
from app.core.db import engine
from app.services.workflow_service import workflow_service
from app.services.geo_service import geo_service
from app.services.knowledge_service import knowledge_service
from app.services.sandbox import sandbox_service
from app.models.user import Analysis, CopilotMessage

celery_app = Celery(
    "worker",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
)

celery_app.conf.beat_schedule = {
    "daily-geo-sync": {
        "task": "sync_recent_geo_datasets",
        "schedule": crontab(minute=0, hour=2),
        "args": (15,)
    }
}

# ==========================================
# 任务 1：原有标准流程执行 (UI 发起的普通任务)
# ==========================================
@celery_app.task(name="run_workflow_task", acks_late=True)
def run_workflow_task(analysis_id: str):
    print(f"🚀 [Celery] Starting task for Analysis ID: {analysis_id}")
    try:
        with Session(engine) as session:
            analysis_uuid = uuid.UUID(analysis_id)
            workflow_service.run_pipeline(session, analysis_uuid)
        return f"Analysis {analysis_id} completed successfully."
    except Exception as e:
        print(f"❌ [Celery] Task failed: {str(e)}")
        raise e

# ==========================================
# 任务 2：GEO 定时同步任务
# ==========================================
@celery_app.task(name="sync_recent_geo_datasets")
def sync_recent_geo_datasets(batch_size=15):
    print(f"🔄 [Cron Task] Starting GEO dataset synchronization (Batch size: {batch_size})...")
    datasets = geo_service.fetch_recent_datasets(retmax=batch_size)
    if not datasets: return 0
        
    success_count = 0
    with Session(engine) as db:
        for ds in datasets:
            try:
                knowledge_service.ingest_geo_dataset(
                    db=db, accession=ds["accession"], raw_title=ds["title"],
                    raw_summary=ds["summary"], url=ds["url"]
                )
                success_count += 1
            except Exception as e:
                print(f"❌ [Cron Task] Error ingesting {ds['accession']}: {e}")
    return success_count

# ==========================================
# 🌟 任务 3：AI 调用的统一分析任务 (核心枢纽)
# ==========================================
@celery_app.task(name="run_ai_workflow_task")
def run_ai_workflow_task(analysis_id: str, session_id: str = "default"):
    """
    此方法完美包裹了原有的 workflow_service.run_pipeline，
    使其不仅能够处理 Nextflow，更能完美执行您库里的 TOOL (R/Perl脚本)，
    最后将结果回传给聊天框。
    """
    print(f"🤖 [AI Celery] Starting unified workflow task {analysis_id}")
    
    try:
        with Session(engine) as session:
            analysis_uuid = uuid.UUID(analysis_id)
            
            # 👇 核心：完全复用您写的完美代码！
            workflow_service.run_pipeline(session, analysis_uuid)
            
            # 执行完毕，刷新状态，判断成败并推送给前端聊天框
            session.refresh(session.get(Analysis, analysis_uuid))
            analysis = session.get(Analysis, analysis_uuid)
            success = (analysis.status == "completed")
            workflow_name = analysis.workflow
            project_id = analysis.project_id
            
            status_icon = "✅" if success else "❌"
            md_msg = f"### {status_icon} Predefined Tool/Pipeline `{workflow_name}` Finished (ID: `{analysis_id[:8]}`)\n\n"
            if success:
                md_msg += "Execution completed successfully! The generated files are saved in the tool's result directory. Please check the **Files** tab."
            else:
                md_msg += "Execution failed. Please check the **Workflows** tab and click `✨ AI Diagnose` for details."

            msg = CopilotMessage(project_id=project_id, session_id=session_id, role="assistant", content=md_msg)
            session.add(msg)
            session.commit()
            
    except Exception as e:
        print(f"❌ [AI Celery] System error: {e}")

# ==========================================
# 🌟 任务 4：AI 调用的自定义沙箱任务 (代码生成与画图)
# ==========================================
@celery_app.task(name="run_sandbox_task")
def run_sandbox_task(analysis_id: str, project_id: str, custom_code: str, session_id: str = "default"):
    print(f"🚀 [Sandbox Task] Starting custom analysis {analysis_id}")
    
    with Session(engine) as db:
        analysis = db.get(Analysis, uuid.UUID(analysis_id))
        if not analysis: return
        analysis.status = "running"
        work_dir = os.path.join(workflow_service.base_work_dir, analysis_id)
        os.makedirs(work_dir, exist_ok=True)
        analysis.work_dir = work_dir
        db.commit()

    log_file = os.path.join(work_dir, "analysis.log")
    with open(log_file, "w", encoding="utf-8") as f:
        f.write("🚀 Starting AI Custom Sandbox Execution...\n")
        f.write("=" * 50 + "\nExecuting Code:\n" + custom_code + "\n" + "=" * 50 + "\n\n")
        
    setup_code = """import os
import warnings
warnings.filterwarnings('ignore')
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import pandas as pd

DATA_DIR = '/data'
WORK_DIR = '/workspace'
os.chdir(WORK_DIR)
"""
    # 这里调用了您完美的 execute_python！
    res = sandbox_service.execute_python(project_id, setup_code + "\n" + custom_code)

    with open(log_file, "a", encoding="utf-8") as f:
        if res['stdout']: f.write("STDOUT:\n" + res['stdout'] + "\n")
        if res['stderr']: f.write("STDERR:\n" + res['stderr'] + "\n")
        f.write("\n\n🏁 Execution Finished.\n")

    # 任务结束，更新状态并向前端回传聊天记录及生成的文件列表
    with Session(engine) as db:
        analysis = db.get(Analysis, uuid.UUID(analysis_id))
        if analysis:
            analysis.status = "completed" if res['success'] else "failed"
        
        status_icon = "✅" if res['success'] else "❌"
        md_msg = f"### {status_icon} Sandbox Analysis Finished (ID: `{analysis_id[:8]}`)\n\n"
        
        # 将生成的图片和文件列入聊天框
        if res['files']:
            md_msg += "**Generated Results:**\n\n"
            for file_info in res['files']:
                if isinstance(file_info, dict):
                    if file_info.get("type") == "image":
                        md_msg += f"![{file_info['name']}]({file_info['data']})\n\n"
                    else:
                        md_msg += f"- 📄 `{file_info['name']}` (Saved in Files tab)\n"
                else:
                    md_msg += f"- 📄 `{file_info}`\n"
        
        if res['stdout']:
            out = res['stdout'][:1000] + ('...' if len(res['stdout'])>1000 else '')
            md_msg += f"\n**Output Summary:**\n```text\n{out}\n```\n"
            
        if res['stderr']:
            err = res['stderr'][:1000] + ('...' if len(res['stderr'])>1000 else '')
            md_msg += f"\n**Error Detail:**\n```text\n{err}\n```\n"

        msg = CopilotMessage(project_id=uuid.UUID(project_id), session_id=session_id, role="assistant", content=md_msg)
        db.add(msg)
        db.commit()