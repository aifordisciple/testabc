import os
import uuid
import subprocess
import shutil
import base64
import pickle
from typing import Dict, Any, Optional

CONTEXT_FILE = ".context.pkl"

CONTEXT_RESTORE_CODE = """
import pickle
import os as _os

_CONTEXT_FILE = '/workspace/.context.pkl'

def _load_context():
    if _os.path.exists(_CONTEXT_FILE):
        try:
            with open(_CONTEXT_FILE, 'rb') as _f:
                return pickle.load(_f)
        except Exception as _e:
            print(f"[Context] Failed to load: {_e}")
    return {}

def _save_context(**kwargs):
    try:
        existing = _load_context()
        existing.update(kwargs)
        with open(_CONTEXT_FILE, 'wb') as _f:
            pickle.dump(existing, _f)
        print(f"[Context] Saved: {list(kwargs.keys())}")
    except Exception as _e:
        print(f"[Context] Failed to save: {_e}")

_prev_context = _load_context()
globals().update(_prev_context)
print(f"[Context] Restored {len(_prev_context)} variables from previous step")
"""

class SandboxService:
    def __init__(self):
        self.upload_root = os.getenv("UPLOAD_ROOT", "/data/uploads")
        self.host_upload_root = os.getenv("HOST_UPLOAD_ROOT", self.upload_root)
        self.sandbox_image = "autonome-tool-env:latest"

    def execute_python(
        self, 
        project_id: str, 
        code: str, 
        timeout: int = 120,
        restore_context: bool = False
    ) -> Dict[str, Any]:
        run_id = str(uuid.uuid4())
        
        container_project_dir = os.path.join(self.upload_root, str(project_id))
        container_workspace_dir = os.path.join(self.upload_root, "sandbox_tmp", run_id)
        
        os.makedirs(container_project_dir, exist_ok=True)
        os.makedirs(container_workspace_dir, exist_ok=True)
        
        if restore_context:
            context_path = os.path.join(container_project_dir, CONTEXT_FILE)
            if os.path.exists(context_path):
                shutil.copy(context_path, os.path.join(container_workspace_dir, CONTEXT_FILE))
                print(f"📥 [Sandbox] Restored context from previous run", flush=True)
        
        full_code = CONTEXT_RESTORE_CODE + "\n\n" + code
        
        script_path = os.path.join(container_workspace_dir, "script.py")
        with open(script_path, "w", encoding="utf-8") as f:
            f.write(full_code)
            
        host_project_dir = os.path.join(self.host_upload_root, str(project_id))
        host_workspace_dir = os.path.join(self.host_upload_root, "sandbox_tmp", run_id)
        
        cmd = [
            "docker", "run", "--rm",
            "--platform", "linux/amd64",
            "--network", "none",
            "--cpus", "1.0",
            "--memory", "2g",
            "-v", f"{host_project_dir}:/data:ro",
            "-v", f"{host_workspace_dir}:/workspace:rw",
            "-w", "/workspace",
            self.sandbox_image,
            "python", "script.py"
        ]
        
        stdout, stderr = "", ""
        success = False
        
        try:
            print(f"🚀 [Sandbox] Executing Docker Command:\n{' '.join(cmd)}", flush=True)
            result = subprocess.run(
                cmd, capture_output=True, text=True, timeout=timeout
            )
            stdout = result.stdout
            stderr = result.stderr
            success = result.returncode == 0
            print(f"✅ [Sandbox] Execution finished. Success: {success}", flush=True)
        except subprocess.TimeoutExpired as e:
            stdout = e.stdout.decode('utf-8', errors='replace') if e.stdout else ""
            stderr = f"Execution timed out after {timeout} seconds."
            success = False
            print(f"⏰ [Sandbox] Timeout: {stderr}", flush=True)
        except Exception as e:
            stderr = f"Sandbox system error: {str(e)}"
            success = False
            print(f"❌ [Sandbox] Error: {stderr}", flush=True)
        
        output_context = None
        if os.path.exists(container_workspace_dir):
            context_output_path = os.path.join(container_workspace_dir, CONTEXT_FILE)
            if os.path.exists(context_output_path):
                try:
                    with open(context_output_path, "rb") as f:
                        output_context = pickle.load(f)
                    print(f"📤 [Sandbox] Saved context with {len(output_context)} variables", flush=True)
                    
                    context_dest = os.path.join(container_project_dir, CONTEXT_FILE)
                    shutil.copy(context_output_path, context_dest)
                except Exception as e:
                    print(f"⚠️ [Sandbox] Failed to save context: {e}", flush=True)
            
            output_files = []
            for root, dirs, files in os.walk(container_workspace_dir):
                for item in files:
                    if item == "script.py" or item == CONTEXT_FILE:
                        continue
                    
                    item_path = os.path.join(root, item)
                    rel_path = os.path.relpath(item_path, container_workspace_dir)
                    
                    if os.path.isfile(item_path):
                        ext = item.split('.')[-1].lower()
                        
                        try:
                            if ext in ['png', 'jpg', 'jpeg', 'svg', 'gif']:
                                with open(item_path, "rb") as img_f:
                                    b64 = base64.b64encode(img_f.read()).decode('utf-8')
                                mime_type = f"image/{ext}" if ext != 'jpg' else "image/jpeg"
                                output_files.append({
                                    "type": "image", 
                                    "name": rel_path,
                                    "data": f"data:{mime_type};base64,{b64}"
                                })
                                print(f"📊 [Sandbox] Collected image: {rel_path}", flush=True)
                                
                            elif ext == 'pdf':
                                with open(item_path, "rb") as pdf_f:
                                    b64 = base64.b64encode(pdf_f.read()).decode('utf-8')
                                output_files.append({
                                    "type": "pdf", 
                                    "name": rel_path, 
                                    "data": f"data:application/pdf;base64,{b64}"
                                })
                                print(f"📄 [Sandbox] Collected PDF: {rel_path}", flush=True)
                                
                            elif ext in ['csv', 'tsv', 'txt', 'log', 'md']:
                                with open(item_path, "r", encoding="utf-8", errors='replace') as txt_f:
                                    content = txt_f.read(1024 * 100)
                                output_files.append({
                                    "type": "text", 
                                    "name": rel_path, 
                                    "content": content
                                })
                                print(f"📝 [Sandbox] Collected text file: {rel_path}", flush=True)
                                
                            elif ext in ['json', 'yaml', 'yml', 'xml']:
                                with open(item_path, "r", encoding="utf-8", errors='replace') as txt_f:
                                    content = txt_f.read(1024 * 100)
                                output_files.append({
                                    "type": "text", 
                                    "name": rel_path, 
                                    "content": content
                                })
                                print(f"📝 [Sandbox] Collected data file: {rel_path}", flush=True)
                            else:
                                with open(item_path, "rb") as f:
                                    b64 = base64.b64encode(f.read()).decode('utf-8')
                                output_files.append({
                                    "type": "binary", 
                                    "name": rel_path, 
                                    "data": f"data:application/octet-stream;base64,{b64}"
                                })
                                print(f"📦 [Sandbox] Collected binary file: {rel_path}", flush=True)
                        except Exception as e:
                            print(f"⚠️ [Sandbox] Failed to read {rel_path}: {e}", flush=True)
                            
            shutil.rmtree(container_workspace_dir, ignore_errors=True)
            
        return {
            "success": success,
            "stdout": stdout,
            "stderr": stderr,
            "files": output_files,
            "context": output_context
        }

    def execute_python_with_retry(
        self,
        project_id: str,
        code: str,
        timeout: int = 120,
        max_retries: int = 3,
        on_retry: Optional[callable] = None
    ) -> Dict[str, Any]:
        """
        带自动重试的执行，失败时通过 LLM 分析并修复代码
        """
        from app.core.agent import analyze_error_and_fix
        
        current_code = code
        retry_count = 0
        
        while retry_count <= max_retries:
            result = self.execute_python(
                project_id=project_id,
                code=current_code,
                timeout=timeout,
                restore_context=(retry_count > 0)
            )
            
            if result['success']:
                return result
            
            if retry_count >= max_retries:
                result['retry_count'] = retry_count
                result['final_attempt'] = True
                return result
            
            data_context = self._get_data_context(project_id)
            
            import asyncio
            fix_result = asyncio.run(analyze_error_and_fix(
                original_code=current_code,
                error_message=result['stderr'],
                stdout=result['stdout'],
                data_context=data_context,
                retry_count=retry_count + 1,
                max_retries=max_retries
            ))
            
            current_code = fix_result.get('fixed_code', current_code)
            
            if on_retry:
                on_retry(retry_count + 1, max_retries, fix_result)
            
            retry_count += 1
        
        result['retry_count'] = retry_count
        return result

    def _get_data_context(self, project_id: str) -> str:
        """获取项目数据上下文（文件列表等）"""
        container_project_dir = os.path.join(self.upload_root, str(project_id))
        
        if not os.path.exists(container_project_dir):
            return "No data directory found"
        
        files_info = []
        for item in os.listdir(container_project_dir):
            item_path = os.path.join(container_project_dir, item)
            if os.path.isfile(item_path):
                size = os.path.getsize(item_path)
                files_info.append(f"- {item} ({size} bytes)")
            elif os.path.isdir(item_path):
                files_info.append(f"- {item}/ (directory)")
        
        return "Available files in /data:\n" + "\n".join(files_info) if files_info else "No files available"

sandbox_service = SandboxService()
