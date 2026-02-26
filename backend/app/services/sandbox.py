import os
import uuid
import subprocess
import shutil
import base64
from typing import Dict, Any

class SandboxService:
    def __init__(self):
        self.upload_root = os.getenv("UPLOAD_ROOT", "/data/uploads")
        self.host_upload_root = os.getenv("HOST_UPLOAD_ROOT", self.upload_root)
        self.sandbox_image = "autonome-tool-env:latest"

    def execute_python(self, project_id: str, code: str, timeout: int = 120) -> Dict[str, Any]:
        run_id = str(uuid.uuid4())
        
        container_project_dir = os.path.join(self.upload_root, str(project_id))
        container_workspace_dir = os.path.join(self.upload_root, "sandbox_tmp", run_id)
        
        os.makedirs(container_project_dir, exist_ok=True)
        os.makedirs(container_workspace_dir, exist_ok=True)
        
        script_path = os.path.join(container_workspace_dir, "script.py")
        with open(script_path, "w", encoding="utf-8") as f:
            f.write(code)
            
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
            
        output_files = []
        if os.path.exists(container_workspace_dir):
            for item in os.listdir(container_workspace_dir):
                if item == "script.py":
                    continue
                
                item_path = os.path.join(container_workspace_dir, item)
                if os.path.isfile(item_path):
                    ext = item.split('.')[-1].lower()
                    
                    try:
                        if ext in ['png', 'jpg', 'jpeg', 'svg', 'gif']:
                            with open(item_path, "rb") as img_f:
                                b64 = base64.b64encode(img_f.read()).decode('utf-8')
                            mime_type = f"image/{ext}" if ext != 'jpg' else "image/jpeg"
                            output_files.append({
                                "type": "image", 
                                "name": item, 
                                "data": f"data:{mime_type};base64,{b64}"
                            })
                            print(f"📊 [Sandbox] Collected image: {item}", flush=True)
                            
                        elif ext == 'pdf':
                            with open(item_path, "rb") as pdf_f:
                                b64 = base64.b64encode(pdf_f.read()).decode('utf-8')
                            output_files.append({
                                "type": "pdf", 
                                "name": item, 
                                "data": f"data:application/pdf;base64,{b64}"
                            })
                            print(f"📄 [Sandbox] Collected PDF: {item}", flush=True)
                            
                        elif ext in ['csv', 'tsv', 'txt', 'log', 'md']:
                            with open(item_path, "r", encoding="utf-8", errors='replace') as txt_f:
                                content = txt_f.read(1024 * 100)
                            output_files.append({
                                "type": "text", 
                                "name": item, 
                                "content": content
                            })
                            print(f"📝 [Sandbox] Collected text file: {item}", flush=True)
                            
                        elif ext in ['json', 'yaml', 'yml', 'xml']:
                            with open(item_path, "r", encoding="utf-8", errors='replace') as txt_f:
                                content = txt_f.read(1024 * 100)
                            output_files.append({
                                "type": "text", 
                                "name": item, 
                                "content": content
                            })
                            print(f"📝 [Sandbox] Collected data file: {item}", flush=True)
                        else:
                            with open(item_path, "rb") as f:
                                b64 = base64.b64encode(f.read()).decode('utf-8')
                            output_files.append({
                                "type": "binary", 
                                "name": item, 
                                "data": f"data:application/octet-stream;base64,{b64}"
                            })
                            print(f"📦 [Sandbox] Collected binary file: {item}", flush=True)
                    except Exception as e:
                        print(f"⚠️ [Sandbox] Failed to read {item}: {e}", flush=True)
                            
            shutil.rmtree(container_workspace_dir, ignore_errors=True)
            
        return {
            "success": success,
            "stdout": stdout,
            "stderr": stderr,
            "files": output_files
        }

sandbox_service = SandboxService()
