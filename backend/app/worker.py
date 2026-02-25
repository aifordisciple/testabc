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

# 1. 初始化 Celery 应用
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

# 定时任务：GEO 知识库同步
celery_app.conf.beat_schedule = {
    "daily-geo-sync": {
        "task": "sync_recent_geo_datasets",
        "schedule": crontab(minute=0, hour=2),
        "args": (15,)
    }
}

# ==========================================
# 任务 1：原有标准流程执行
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
    if not datasets:
        print("⚠️ [Cron Task] No datasets fetched. Aborting.")
        return 0
        
    success_count = 0
    with Session(engine) as db:
        for ds in datasets:
            try:
                knowledge_service.ingest_geo_dataset(
                    db=db,
                    accession=ds["accession"],
                    raw_title=ds["title"],
                    raw_summary=ds["summary"],
                    url=ds["url"]
                )
                success_count += 1
            except Exception as e:
                print(f"❌ [Cron Task] Error ingesting {ds['accession']}: {e}")
                
    print(f"✅ [Cron Task] GEO sync completed. Successfully processed {success_count}/{len(datasets)} datasets.")
    return success_count

# ==========================================
# 任务 3：AI 调用的 Nextflow 任务 (带回传聊天记录功能)
# ==========================================
@celery_app.task(name="run_nextflow_pipeline")
def run_nextflow_pipeline(analysis_id: str, project_id: str, workflow_name: str, params: dict, session_id: str = "default"):
    print(f"🚀 Starting background nextflow task {analysis_id}")
    
    with Session(engine) as db:
        analysis = db.get(Analysis, uuid.UUID(analysis_id))
        if not analysis: return
        analysis.status = "running"
        
        work_dir = os.path.join(workflow_service.base_work_dir, analysis_id)
        os.makedirs(work_dir, exist_ok=True)
        analysis.work_dir = work_dir
        db.commit()

    script_dir = os.path.join("/app/pipelines", workflow_name)
    main_script = os.path.join(script_dir, "main.nf")
    
    if not os.path.exists(main_script):
        with Session(engine) as db:
            analysis = db.get(Analysis, uuid.UUID(analysis_id))
            if analysis:
                analysis.status = "failed"
                db.commit()
        return

    cmd = ["nextflow", "run", main_script, "-with-docker", "ubuntu:20.04"]
    for k, v in params.items():
        if isinstance(v, bool):
            if v: cmd.append(f"--{k}")
        else:
            cmd.extend([f"--{k}", str(v)])

    log_file = os.path.join(work_dir, "analysis.log")
    with open(log_file, "w") as f:
        f.write(f"Running command: {' '.join(cmd)}\n")
        f.write("="*50 + "\n")
        
        process = subprocess.Popen(
            cmd, cwd=work_dir, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True
        )
        
        # 修复点：严格缩进，读取输出写入日志
        for line in process.stdout:
            f.write(line)
            f.flush()
            
        process.wait()

    success = (process.returncode == 0)
    
    # 任务结束，更新状态并向前端回传聊天记录
    with Session(engine) as db:
        analysis = db.get(Analysis, uuid.UUID(analysis_id))
        if analysis:
            analysis.status = "completed" if success else "failed"
        
        status_icon = "✅" if success else "❌"
        md_msg = f"### {status_icon} Pipeline `{workflow_name}` Finished (ID: `{analysis_id[:8]}`)\n\n"
        if success:
            md_msg += "Execution completed successfully! Please check the **Files** tab to view or download the generated HTML reports and results."
        else:
            md_msg += "Execution failed. Please check the **Workflows** tab and click `✨ AI Diagnose` for details."

        msg = CopilotMessage(project_id=uuid.UUID(project_id), session_id=session_id, role="assistant", content=md_msg)
        db.add(msg)
        db.commit()

# ==========================================
# 任务 4：AI 调用的自定义沙箱任务 (带回传聊天记录功能)
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
    res = sandbox_service.execute_python(project_id, setup_code + "\n" + custom_code)

    with open(log_file, "a", encoding="utf-8") as f:
        if res['stdout']: f.write("STDOUT:\n" + res['stdout'] + "\n")
        if res['stderr']: f.write("STDERR:\n" + res['stderr'] + "\n")
        if res['files']: f.write(f"\n✅ Generated Files: {[f['name'] for f in res['files']]}\n")
        f.write("\n\n🏁 Execution Finished.\n")

    # 任务结束，更新状态并向前端回传聊天记录及生成的文件列表
    with Session(engine) as db:
        analysis = db.get(Analysis, uuid.UUID(analysis_id))
        if analysis:
            analysis.status = "completed" if res['success'] else "failed"
        
        status_icon = "✅" if res['success'] else "❌"
        md_msg = f"### {status_icon} Sandbox Analysis Finished (ID: `{analysis_id[:8]}`)\n\n"
        
        if res['files']:
            md_msg += "**Generated Results:**\n"
            for file_info in res['files']:
                fname = file_info if isinstance(file_info, str) else file_info.get('name', str(file_info))
                md_msg += f"- 📄 `{fname}` (Available in the **Files** tab)\n"
        
        if res['stdout']:
            out = res['stdout'][:1000] + ('...' if len(res['stdout'])>1000 else '')
            md_msg += f"\n**Output Summary:**\n```text\n{out}\n```\n"
            
        if res['stderr']:
            err = res['stderr'][:1000] + ('...' if len(res['stderr'])>1000 else '')
            md_msg += f"\n**Error Detail:**\n```text\n{err}\n```\n"

        msg = CopilotMessage(project_id=uuid.UUID(project_id), session_id=session_id, role="assistant", content=md_msg)
        db.add(msg)
        db.commit()