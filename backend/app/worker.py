import os
import json
import uuid
import subprocess
import base64
from celery import Celery
from celery.schedules import crontab
from sqlmodel import Session

from app.core.config import settings
from app.core.db import engine
from app.services.workflow_service import workflow_service
from app.services.geo_service import geo_service
from app.services.knowledge_service import knowledge_service
from app.services.sandbox import sandbox_service
from app.models.user import Analysis, CopilotMessage, Project, File, ProjectFileLink

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

@celery_app.task(name="sync_recent_geo_datasets")
def sync_recent_geo_datasets(batch_size=15):
    print(f"🔄 [Cron Task] Starting GEO dataset synchronization...")
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

@celery_app.task(name="run_ai_workflow_task")
def run_ai_workflow_task(analysis_id: str, session_id: str = "default"):
    print(f"🤖 [AI Celery] Starting unified workflow task {analysis_id}")
    try:
        with Session(engine) as session:
            analysis_uuid = uuid.UUID(analysis_id)
            workflow_service.run_pipeline(session, analysis_uuid)
            
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

@celery_app.task(name="run_sandbox_task")
def run_sandbox_task(analysis_id: str, project_id: str, custom_code: str, session_id: str = "default"):
    print(f"🚀 [Sandbox Task] Starting custom analysis {analysis_id}")
    
    try:
        with Session(engine) as db:
            analysis = db.get(Analysis, uuid.UUID(analysis_id))
            if not analysis:
                print(f"❌ [Sandbox Task] Analysis {analysis_id} not found")
                return
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
            f.write("\n\n🏁 Execution Finished.\n")

        print(f"📊 [Sandbox Task] Execution result: success={res['success']}, files={len(res.get('files', []))}", flush=True)

        with Session(engine) as db:
            analysis = db.get(Analysis, uuid.UUID(analysis_id))
            if analysis:
                analysis.status = "completed" if res['success'] else "failed"
                db.commit()
                print(f"✅ [Sandbox Task] Updated analysis status to: {analysis.status}", flush=True)
            
            project = db.get(Project, uuid.UUID(project_id))
            status_icon = "✅" if res['success'] else "❌"
            md_msg = f"### {status_icon} Sandbox Analysis Finished (ID: `{analysis_id[:8]}`)\n\n"
            
            attachments = []
            
            if res.get('files') and project:
                md_msg += "**Generated Results:**\n\n"
                
                upload_root = os.getenv("UPLOAD_ROOT", "/data/uploads")
                save_dir = os.path.join(upload_root, str(project_id))
                os.makedirs(save_dir, exist_ok=True)
                
                for file_info in res['files']:
                    if isinstance(file_info, dict):
                        fname = file_info.get("name", "output.txt")
                        fpath = os.path.join(save_dir, fname)
                        
                        try:
                            file_type = file_info.get("type", "text")
                            
                            if file_type == "image" and file_info.get("data"):
                                b64_str = file_info['data'].split(",")[1]
                                with open(fpath, "wb") as f:
                                    f.write(base64.b64decode(b64_str))
                                
                                attachments.append({
                                    "type": "image",
                                    "name": fname,
                                    "data": file_info['data']
                                })
                                print(f"📊 [Sandbox Task] Saved image: {fname}", flush=True)
                                
                            elif file_type == "pdf" and file_info.get("data"):
                                b64_str = file_info['data'].split(",")[1]
                                with open(fpath, "wb") as f:
                                    f.write(base64.b64decode(b64_str))
                                
                                attachments.append({
                                    "type": "pdf",
                                    "name": fname,
                                    "data": file_info['data']
                                })
                                md_msg += f"- 📄 `{fname}` (PDF)\n"
                                print(f"📄 [Sandbox Task] Saved PDF: {fname}", flush=True)
                                
                            elif file_type == "text" and file_info.get("content"):
                                with open(fpath, "w", encoding="utf-8") as f:
                                    f.write(file_info['content'])
                                
                                content = file_info['content']
                                preview_lines = content.split('\n')[:20]
                                
                                if fname.endswith(('.csv', '.tsv')):
                                    attachments.append({
                                        "type": "table",
                                        "name": fname,
                                        "preview": '\n'.join(preview_lines),
                                        "full_available": True
                                    })
                                    print(f"📊 [Sandbox Task] Saved table: {fname}", flush=True)
                                else:
                                    md_msg += f"- 📄 `{fname}`\n"
                                    print(f"📝 [Sandbox Task] Saved text: {fname}", flush=True)
                                    
                            elif file_type == "binary" and file_info.get("data"):
                                b64_str = file_info['data'].split(",")[1]
                                with open(fpath, "wb") as f:
                                    f.write(base64.b64decode(b64_str))
                                md_msg += f"- 📦 `{fname}` (Binary)\n"
                                print(f"📦 [Sandbox Task] Saved binary: {fname}", flush=True)
                            else:
                                md_msg += f"- 📄 `{fname}`\n"
                            
                            if os.path.exists(fpath):
                                fsize = os.path.getsize(fpath)
                                content_type = "application/octet-stream"
                                if file_type == "image":
                                    content_type = "image/" + fname.split('.')[-1]
                                elif file_type == "pdf":
                                    content_type = "application/pdf"
                                elif file_type == "text":
                                    content_type = "text/plain"
                                
                                db_file = File(
                                    filename=fname, size=fsize,
                                    content_type=content_type,
                                    s3_key=f"{project_id}/{fname}",
                                    uploader_id=project.owner_id
                                )
                                db.add(db_file)
                                db.commit()
                                db.refresh(db_file)
                                
                                db.add(ProjectFileLink(project_id=project.id, file_id=db_file.id))
                                db.commit()
                            
                        except Exception as e:
                            print(f"❌ [Sandbox Task] Failed to save file {fname}: {e}", flush=True)
                            md_msg += f"- ⚠️ `{fname}` (save failed)\n"
                    else:
                        md_msg += f"- 📄 `{file_info}`\n"
                
                md_msg += "\n*(Files are stored in your **Files** tab)*\n\n"
            
            if res.get('stdout'):
                out = res['stdout'][:1000] + ('...' if len(res['stdout'])>1000 else '')
                md_msg += f"\n**Output Summary:**\n```text\n{out}\n```\n"
                
            if res.get('stderr'):
                err = res['stderr'][:1000] + ('...' if len(res['stderr'])>1000 else '')
                md_msg += f"\n**Error Detail:**\n```text\n{err}\n```\n"

            msg = CopilotMessage(
                project_id=uuid.UUID(project_id), 
                session_id=session_id, 
                role="assistant", 
                content=md_msg,
                attachments=json.dumps(attachments) if attachments else None
            )
            db.add(msg)
            db.commit()
            print(f"✅ [Sandbox Task] Message saved to chat, task completed", flush=True)
            
    except Exception as e:
        print(f"❌ [Sandbox Task] Critical error: {e}", flush=True)
        import traceback
        traceback.print_exc()
        
        try:
            with Session(engine) as db:
                analysis = db.get(Analysis, uuid.UUID(analysis_id))
                if analysis:
                    analysis.status = "failed"
                    db.commit()
                
                msg = CopilotMessage(
                    project_id=uuid.UUID(project_id), 
                    session_id=session_id, 
                    role="assistant", 
                    content=f"### ❌ Sandbox Analysis Failed\n\n**Error:** `{str(e)}`\n\nPlease check your code and try again."
                )
                db.add(msg)
                db.commit()
        except Exception as inner_e:
            print(f"❌ [Sandbox Task] Failed to save error message: {inner_e}", flush=True)
