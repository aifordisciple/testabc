import os
import json
import uuid
import subprocess
import base64
from datetime import datetime
from celery import Celery
from celery.schedules import crontab
from sqlmodel import Session

from app.core.config import settings
from app.core.db import engine
from app.services.workflow_service import workflow_service
from app.services.geo_service import geo_service
from app.services.knowledge_service import knowledge_service
from app.services.sandbox import sandbox_service
from app.models.user import Analysis, CopilotMessage, Project, File, ProjectFileLink, TaskChain

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
            md_msg = f"### {status_icon} Tool/Pipeline `{workflow_name}` Finished\n\n"
            md_msg += f"**Task ID:** `{analysis_id[:8]}`\n\n"
            md_msg += f"[📊 View Task Details & Results](/dashboard/task/{analysis_id})\n\n"
            if success:
                md_msg += "Execution completed successfully! Click the link above to view results and download files."
            else:
                md_msg += "Execution failed. Click the link above to view logs and error details."

            msg = CopilotMessage(project_id=project_id, session_id=session_id, role="assistant", content=md_msg)
            session.add(msg)
            session.commit()
    except Exception as e:
        print(f"❌ [AI Celery] System error: {e}")

SETUP_CODE = """import os
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

def _save_files_to_project(db: Session, project_id: str, files: list, res: dict):
    """保存生成的文件到项目目录并记录到数据库"""
    upload_root = os.getenv("UPLOAD_ROOT", "/data/uploads")
    save_dir = os.path.join(upload_root, str(project_id))
    os.makedirs(save_dir, exist_ok=True)
    
    project = db.get(Project, uuid.UUID(project_id))
    if not project:
        return []
    
    saved_files = []
    for file_info in files:
        if isinstance(file_info, dict):
            fname = file_info.get("name", "output.txt")
            fpath = os.path.join(save_dir, fname)
            
            fdir = os.path.dirname(fpath)
            if fdir:
                os.makedirs(fdir, exist_ok=True)
            
            try:
                file_type = file_info.get("type", "text")
                
                if file_type == "image" and file_info.get("data"):
                    b64_str = file_info['data'].split(",")[1]
                    with open(fpath, "wb") as f:
                        f.write(base64.b64decode(b64_str))
                    saved_files.append({"type": "image", "name": fname, "data": file_info['data']})
                    print(f"📊 [Worker] Saved image: {fname}", flush=True)
                    
                elif file_type == "pdf" and file_info.get("data"):
                    b64_str = file_info['data'].split(",")[1]
                    with open(fpath, "wb") as f:
                        f.write(base64.b64decode(b64_str))
                    saved_files.append({"type": "pdf", "name": fname, "data": file_info['data']})
                    print(f"📄 [Worker] Saved PDF: {fname}", flush=True)
                    
                elif file_type == "text" and file_info.get("content"):
                    with open(fpath, "w", encoding="utf-8") as f:
                        f.write(file_info['content'])
                    
                    if fname.endswith(('.csv', '.tsv')):
                        preview_lines = file_info['content'].split('\n')[:20]
                        saved_files.append({
                            "type": "table", "name": fname,
                            "preview": '\n'.join(preview_lines), "full_available": True
                        })
                    print(f"📝 [Worker] Saved text: {fname}", flush=True)
                    
                elif file_type == "binary" and file_info.get("data"):
                    b64_str = file_info['data'].split(",")[1]
                    with open(fpath, "wb") as f:
                        f.write(base64.b64decode(b64_str))
                    print(f"📦 [Worker] Saved binary: {fname}", flush=True)
                
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
                print(f"❌ [Worker] Failed to save file {fname}: {e}", flush=True)
    
    return saved_files

def _send_progress_message(db: Session, project_id: str, session_id: str, content: str):
    """发送进度消息到聊天"""
    msg = CopilotMessage(
        project_id=uuid.UUID(project_id),
        session_id=session_id,
        role="assistant",
        content=content
    )
    db.add(msg)
    db.commit()

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
            
        res = sandbox_service.execute_python(project_id, SETUP_CODE + "\n" + custom_code)

        with open(log_file, "a", encoding="utf-8") as f:
            if res['stdout']: f.write("STDOUT:\n" + res['stdout'] + "\n")
            if res['stderr']: f.write("STDERR:\n" + res['stderr'] + "\n")
            f.write("\n\n🏁 Execution Finished.\n")

        print(f"📊 [Sandbox Task] Execution result: success={res['success']}, files={len(res.get('files', []))}", flush=True)
        print(f"📊 [Sandbox Task] stdout length: {len(res.get('stdout', ''))}, stderr length: {len(res.get('stderr', ''))}", flush=True)

        with Session(engine) as db:
            analysis = db.get(Analysis, uuid.UUID(analysis_id))
            if analysis:
                analysis.status = "completed" if res['success'] else "failed"
                db.commit()
                print(f"✅ [Sandbox Task] Updated analysis status to: {analysis.status}", flush=True)
            
            project = db.get(Project, uuid.UUID(project_id))
            status_icon = "✅" if res['success'] else "⚠️"
            md_msg = f"### {status_icon} Sandbox Analysis Finished\n\n"
            md_msg += f"**Task ID:** `{analysis_id[:8]}`\n\n"
            md_msg += f"[📊 View Task Details & Results](/dashboard/task/{analysis_id})\n\n"
            
            attachments = []
            
            if res.get('files') and project:
                md_msg += "**Generated Results:**\n\n"
                try:
                    attachments = _save_files_to_project(db, project_id, res['files'], res)
                    # Add result previews
                    for att in attachments:
                        if att.get('type') == 'image':
                            md_msg += f"![{att['name']}]({att.get('data', '')[:100]}...)\n\n"
                        elif att.get('type') == 'table':
                            md_msg += f"**Table: {att['name']}**\n```\n{att.get('preview', '')[:500]}\n```\n\n"
                    md_msg += "\n*(Files are stored in your **Files** tab)*\n\n"
                except Exception as save_err:
                    print(f"❌ [Sandbox Task] Failed to save files: {save_err}", flush=True)
                    md_msg += f"\n*(Warning: Failed to save some files: {save_err})*\n\n"
            
            if res.get('stdout'):
                out = res['stdout'][:1000] + ('...' if len(res['stdout'])>1000 else '')
                md_msg += f"\n**Output Summary:**\n```text\n{out}\n```\n"
                
            if res.get('stderr'):
                err = res['stderr'][:1000] + ('...' if len(res['stderr'])>1000 else '')
                md_msg += f"\n**Warnings/Errors:**\n```text\n{err}\n```\n"
            
            if res.get('error_classified'):
                ec = res['error_classified']
                md_msg += f"\n**Error Analysis:**\n"
                md_msg += f"- Type: {ec.get('category', 'unknown')}\n"
                md_msg += f"- Message: {ec.get('message', 'N/A')}\n"
                md_msg += f"- Suggestion: {ec.get('suggestion', 'N/A')}\n"

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

@celery_app.task(name="run_task_chain")
def run_task_chain(chain_id: str):
    """
    执行多步骤任务链，支持自动错误恢复
    """
    print(f"🔗 [Task Chain] Starting chain {chain_id}", flush=True)
    
    try:
        with Session(engine) as db:
            chain = db.get(TaskChain, uuid.UUID(chain_id))
            if not chain:
                print(f"❌ [Task Chain] Chain {chain_id} not found")
                return
            
            chain.status = "running"
            db.commit()
            
            project_id = str(chain.project_id)
            session_id = chain.session_id
            steps = json.loads(chain.steps_json)
            total_steps = len(steps)
            
            _send_progress_message(
                db, project_id, session_id,
                f"🚀 **Task Chain Started** (ID: `{chain_id[:8]}`)\n\n"
                f"Total steps: {total_steps}\n"
                f"Strategy: {chain.strategy or 'N/A'}\n\n"
                f"I will notify you as each step completes."
            )
            
            all_attachments = []
            
            for step_info in steps:
                step_num = step_info.get("step", chain.current_step + 1)
                action = step_info.get("action", "Unknown")
                code = step_info.get("code", "")
                expected_output = step_info.get("expected_output", "")
                
                chain.current_step = step_num - 1
                db.commit()
                
                _send_progress_message(
                    db, project_id, session_id,
                    f"⏳ **Step {step_num}/{total_steps}**: {action}\n\n"
                    f"Expected: {expected_output}"
                )
                
                print(f"🔗 [Task Chain] Step {step_num}/{total_steps}: {action}", flush=True)
                
                retry_count = 0
                max_retries = 3
                success = False
                res = {"success": False, "stdout": "", "stderr": "No execution attempted", "files": []}
                
                while retry_count < max_retries and not success:
                    res = sandbox_service.execute_python(
                        project_id=project_id,
                        code=SETUP_CODE + "\n" + code,
                        timeout=180,
                        restore_context=(step_num > 1)
                    )
                    
                    success = res['success']
                    
                    if not success and retry_count < max_retries - 1:
                        retry_count += 1
                        
                        from app.core.agent import analyze_error_and_fix
                        import asyncio
                        
                        data_context = sandbox_service._get_data_context(project_id)
                        
                        fix_result = asyncio.run(analyze_error_and_fix(
                            original_code=code,
                            error_message=res['stderr'],
                            stdout=res['stdout'],
                            data_context=data_context,
                            retry_count=retry_count,
                            max_retries=max_retries
                        ))
                        
                        code = fix_result.get('fixed_code', code)
                        
                        _send_progress_message(
                            db, project_id, session_id,
                            f"🔄 **Step {step_num} Auto-Retry** ({retry_count}/{max_retries})\n\n"
                            f"**Analysis:** {fix_result.get('analysis', 'N/A')[:200]}...\n\n"
                            f"Attempting fix..."
                        )
                        
                        chain.retry_count = retry_count
                        chain.last_error = res['stderr'][:500] if res['stderr'] else None
                        db.commit()
                
                if success:
                    chain.retry_count = 0
                    chain.last_error = None
                    db.commit()
                    
                    if res.get('files'):
                        saved = _save_files_to_project(db, project_id, res['files'], res)
                        all_attachments.extend(saved)
                    
                    _send_progress_message(
                        db, project_id, session_id,
                        f"✅ **Step {step_num}/{total_steps} Completed**: {action}\n\n"
                        f"Output: {expected_output}"
                    )
                    
                    print(f"✅ [Task Chain] Step {step_num} completed", flush=True)
                else:
                    chain.status = "failed"
                    db.commit()
                    
                    _send_progress_message(
                        db, project_id, session_id,
                        f"### ❌ Task Chain Failed at Step {step_num}\n\n"
                        f"**Action:** {action}\n\n"
                        f"**Error:**\n```\n{res['stderr'][:1000] if res['stderr'] else 'Unknown error'}\n```\n\n"
                        f"After {max_retries} auto-retry attempts, the task could not be completed."
                    )
                    
                    print(f"❌ [Task Chain] Failed at step {step_num}", flush=True)
                    return
            
            chain.status = "completed"
            chain.current_step = total_steps
            db.commit()
            
            final_msg = f"### 🎉 Task Chain Completed!\n\n"
            final_msg += f"**Chain ID:** `{chain_id[:8]}`\n\n"
            final_msg += f"**Strategy:** {chain.strategy or 'N/A'}\n\n"
            final_msg += f"**Steps Completed:** {total_steps}/{total_steps}\n\n"
            
            if all_attachments:
                final_msg += "**Generated Files:**\n"
                for att in all_attachments:
                    final_msg += f"- 📄 `{att['name']}`\n"
                    # Add preview for images and tables
                    if att.get('type') == 'image':
                        final_msg += f"  ![{att['name']}]({att.get('data', '')[:100]}...)\n"
                    elif att.get('type') == 'table':
                        final_msg += f"  ```\n  {att.get('preview', '')[:300]}\n  ```\n"
                final_msg += "\n*(Check the **Files** tab for all generated files)*\n"
            msg = CopilotMessage(
                project_id=chain.project_id,
                session_id=session_id,
                role="assistant",
                content=final_msg,
                attachments=json.dumps(all_attachments) if all_attachments else None
            )
            db.add(msg)
            db.commit()
            
            print(f"✅ [Task Chain] Chain {chain_id} completed successfully", flush=True)
            
    except Exception as e:
        print(f"❌ [Task Chain] Critical error: {e}", flush=True)
        import traceback
        traceback.print_exc()
        
        try:
            with Session(engine) as db:
                chain = db.get(TaskChain, uuid.UUID(chain_id))
                if chain:
                    chain.status = "failed"
                    db.commit()
                    
                    msg = CopilotMessage(
                        project_id=chain.project_id,
                        session_id=chain.session_id,
                        role="assistant",
                        content=f"### ❌ Task Chain Failed\n\n**Error:** `{str(e)}`"
                    )
                    db.add(msg)
                    db.commit()
        except Exception as inner_e:
            print(f"❌ [Task Chain] Failed to save error: {inner_e}", flush=True)
