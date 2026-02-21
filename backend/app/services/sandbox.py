import os
import uuid
import subprocess
import shutil
import base64
from typing import Dict, Any

class SandboxService:
    def __init__(self):
        # 1. 容器内部的挂载点 (供后端读写临时文件使用)
        self.upload_root = os.getenv("UPLOAD_ROOT", "/data/uploads")
        
        # 2. 宿主机的真实物理路径 (供 Docker Daemon 进行挂载使用)
        # 如果没有配置 HOST_UPLOAD_ROOT，默认使用 upload_root 作为兜底
        self.host_upload_root = os.getenv("HOST_UPLOAD_ROOT", self.upload_root)
        
        # 沙箱镜像
        self.sandbox_image = "autonome-tool-env:latest"

    def execute_python(self, project_id: str, code: str, timeout: int = 60) -> Dict[str, Any]:
        """
        在隔离的 Docker 容器中执行 Python 代码。
        采用宿主机路径与容器路径分离策略，完美解决 Docker-in-Docker (DooD) 挂载错误。
        
        Args:
            project_id: 项目ID
            code: 待执行的 Python 代码
            timeout: 超时时间(秒)，默认 60s
        """
        run_id = str(uuid.uuid4())
        
        # ==========================================
        # 路径 A：Backend 容器内部使用的路径
        # ==========================================
        container_project_dir = os.path.join(self.upload_root, str(project_id))
        container_workspace_dir = os.path.join(self.upload_root, "sandbox_tmp", run_id)
        
        # 确保目录存在
        os.makedirs(container_project_dir, exist_ok=True)
        os.makedirs(container_workspace_dir, exist_ok=True)
        
        # 将代码写入后端容器内的临时目录
        script_path = os.path.join(container_workspace_dir, "script.py")
        with open(script_path, "w", encoding="utf-8") as f:
            f.write(code)
            
        # ==========================================
        # 路径 B：宿主机物理路径 (传递给 Docker 命令)
        # ==========================================
        host_project_dir = os.path.join(self.host_upload_root, str(project_id))
        host_workspace_dir = os.path.join(self.host_upload_root, "sandbox_tmp", run_id)
        
        # 构建 Docker 命令，注意这里用的是 host_xxx_dir
        cmd = [
            "docker", "run", "--rm",
            "--network", "none",          # 断网
            "--cpus", "1.0",              # 限制 1 个 CPU
            "--memory", "2g",             # 限制 2GB 内存
            "-v", f"{host_project_dir}:/data:ro",     # 只读挂载用户数据
            "-v", f"{host_workspace_dir}:/workspace:rw", # 读写挂载临时空间
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
        except subprocess.TimeoutExpired as e:
            stdout = e.stdout.decode('utf-8', errors='replace') if e.stdout else ""
            stderr = f"Execution timed out after {timeout} seconds."
            success = False
        except Exception as e:
            stderr = f"Sandbox system error: {str(e)}"
            success = False
            
        # ==========================================
        # 解析产出物 (再次使用容器内部路径读取)
        # ==========================================
        output_files = []
        if os.path.exists(container_workspace_dir):
            for item in os.listdir(container_workspace_dir):
                if item == "script.py":
                    continue
                
                item_path = os.path.join(container_workspace_dir, item)
                if os.path.isfile(item_path):
                    ext = item.split('.')[-1].lower()
                    
                    if ext in ['png', 'jpg', 'jpeg', 'svg']:
                        with open(item_path, "rb") as img_f:
                            b64 = base64.b64encode(img_f.read()).decode('utf-8')
                            output_files.append({
                                "type": "image", 
                                "name": item, 
                                "data": f"data:image/{ext};base64,{b64}"
                            })
                    # 如果输出表格，优先处理为 TSV 或截取文本预览
                    elif ext in ['csv', 'tsv', 'txt']:
                        with open(item_path, "r", encoding="utf-8", errors='replace') as txt_f:
                            content = txt_f.read(1024 * 50) # 读取前 50KB
                            output_files.append({
                                "type": "text", 
                                "name": item, 
                                "content": content
                            })
                            
            # 及时清理后端容器内的临时文件
            shutil.rmtree(container_workspace_dir, ignore_errors=True)
            
        return {
            "success": success,
            "stdout": stdout,
            "stderr": stderr,
            "files": output_files
        }

sandbox_service = SandboxService()