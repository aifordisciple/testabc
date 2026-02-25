from celery import Celery
from sqlmodel import Session
import uuid

from app.core.config import settings
from app.core.db import engine
from app.models.user import Analysis, CopilotMessage  # 👇 导入 CopilotMessage
from app.services.workflow_service import workflow_service
from app.services.sandbox import sandbox_service

# 1. 初始化 Celery 应用
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

@celery_app.task(name="run_nextflow_pipeline")
def run_nextflow_pipeline(analysis_id: str, project_id: str, workflow_name: str, params: dict, session_id: str = "default"):
    """
    Nextflow 任务：执行生信分析流程
    任务完成后，自动向聊天窗口推送结果
    """
    import uuid
    from app.core.db import engine
    from app.models.user import Analysis, CopilotMessage
    from sqlmodel import Session
    from app.services.workflow_service import workflow_service
    import os
    import subprocess
    import time
    
    print(f"🚀 Starting background nextflow task {analysis_id} with session {session_id}")
    
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
        
        for line in process.stdout:
            f.write(line)
            f.flush()
            
        process.wait()

    success = (process.returncode == 0)
    with Session(engine) as db:
        analysis = db.get(Analysis, uuid.UUID(analysis_id))
        analysis.status = "completed" if success else "failed"
        db.commit()

    # 👇 核心：任务结束时，主动往对话推送消息（带上 session_id）
    status_icon = "✅" if success else "❌"
    md_msg = f"### {status_icon} Pipeline `{workflow_name}` Finished (ID: `{analysis_id[:8]}`)\n\n"
    if success:
        md_msg += "Execution completed! 🎉 Please check the **Files** tab to view or download HTML reports and results."
    else:
        md_msg += "Execution failed. Please check the **Workflows** tab and click **✨ AI Diagnose** for details."

    msg = CopilotMessage(
        project_id=uuid.UUID(project_id),
        session_id=session_id,
        role="assistant",
        content=md_msg
    )
    db.add(msg)
    db.commit()


@celery_app.task(name="run_sandbox_task")
def run_sandbox_task(analysis_id: str, project_id: str, custom_code: str, session_id: str = "default"):
    """
    沙箱任务：执行 AI 生成的 Python 代码
    任务完成后，自动向聊天窗口推送结果
    """
    import uuid
    from app.core.db import engine
    from app.models.user import Analysis, CopilotMessage
    from sqlmodel import Session
    from app.services.workflow_service import workflow_service
    import os
    
    print(f"🚀 [Sandbox Task] Starting custom analysis {analysis_id} with session {session_id}")
    
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
        f.write("=" * 50 + "\n")
        f.write("Executing Code:\n" + custom_code + "\n")
        f.write("=" * 50 + "\n\n")
        
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

    with Session(engine) as db:
        analysis = db.get(Analysis, uuid.UUID(analysis_id))
        analysis.status = "completed" if res['success'] else "failed"
        db.commit()

    # 👇 核心：沙箱任务结束时，主动推送带结果文件预览的消息
    status_icon = "✅" if res['success'] else "❌"
    md_msg = f"### {status_icon} Sandbox Analysis Finished (ID: `{analysis_id[:8]}`)\n\n"
    
    if res['files']:
        md_msg += "**Generated Results:**\n"
        for file_info in res['files']:
            fname = file_info if isinstance(file_info, str) else file_info.get('name', str(file_info))
            md_msg += f"- 📄 `{fname}` (Available in the **Files** tab)\n"
    
    if res['stdout']:
        out = res['stdout'][:1000] + ('...' if len(res['stdout']) > 1000 else '')
        md_msg += f"\n**Output Summary:**\n```text\n{out}\n```\n"
    
    if res['stderr']:
        err = res['stderr'][:1000] + ('...' if len(res['stderr']) > 1000 else '')
        md_msg += f"\n**Error Detail:**\n```text\n{err}\n```\n"

    msg = CopilotMessage(
        project_id=uuid.UUID(project_id),
        session_id=session_id,
        role="assistant",
        content=md_msg
    )
    db.add(msg)
    db.commit()

# 👇 追加导入相关的包
from app.services.geo_service import geo_service
from app.services.knowledge_service import knowledge_service
from app.core.db import engine
from sqlmodel import Session

@celery_app.task(name="sync_recent_geo_datasets")
def sync_recent_geo_datasets(batch_size=15):
    """后台定时任务：抓取最新 GEO 数据，调用大模型清洗并存入向量库"""
    print(f"🔄 [Cron Task] Starting GEO dataset synchronization (Batch size: {batch_size})...")
    
    datasets = geo_service.fetch_recent_datasets(max=batch_size)
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
