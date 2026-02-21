import os
import uuid
import subprocess
import shutil
import base64
from typing import Dict, Any

class SandboxService:
    def __init__(self):
        # 挂载的根目录，通常是 /data/uploads
        self.upload_root = os.getenv("UPLOAD_ROOT", "/data/uploads")
        # 您之前构建好的包含数据科学库的镜像
        self.sandbox_image = "autonome-tool-env:latest"

    def execute_python(self, project_id: str, code: str, timeout: int = 60) -> Dict[str, Any]:
        """
        在一个隔离的 Docker 容器中执行 Python 代码，并捕获输出。
        """
        run_id = str(uuid.uuid4())
        
        # 1. 路径准备
        # 用户的项目目录 (挂载为只读，供 pandas 读表)
        project_dir = os.path.join(self.upload_root, str(project_id))
        
        # 本次执行的临时读写目录 (存放脚本和输出的图表)
        workspace_dir = os.path.join(self.upload_root, "sandbox_tmp", run_id)
        os.makedirs(workspace_dir, exist_ok=True)
        
        # 2. 将代码写入临时目录的 script.py
        script_path = os.path.join(workspace_dir, "script.py")
        with open(script_path, "w", encoding="utf-8") as f:
            f.write(code)
            
        # 3. 构建安全的 Docker 命令
        cmd = [
            "docker", "run", "--rm",
            "--network", "none",          # 🔒 安全：断开网络
            "--cpus", "1.0",              # 🔒 安全：限制最多使用 1 个 CPU 核心
            "--memory", "2g",             # 🔒 安全：限制最大内存为 2GB
            # 挂载用户项目数据为 只读 (ro -> read-only)
            "-v", f"{project_dir}:/data:ro",
            # 挂载当前临时目录为 读写 (rw -> read-write)
            "-v", f"{workspace_dir}:/workspace:rw",
            "-w", "/workspace",
            self.sandbox_image,
            "python", "script.py"
        ]
        
        stdout, stderr = "", ""
        success = False
        
        try:
            print(f"🚀 [Sandbox] Running code for project {project_id} in container...", flush=True)
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
            
        # 4. 捕获产出物 (图表 / CSV 等)
        output_files = []
        if os.path.exists(workspace_dir):
            for item in os.listdir(workspace_dir):
                if item == "script.py":
                    continue
                
                item_path = os.path.join(workspace_dir, item)
                if os.path.isfile(item_path):
                    ext = item.split('.')[-1].lower()
                    
                    # 如果是图片，直接转为 Base64 以供前端内联渲染
                    if ext in ['png', 'jpg', 'jpeg', 'svg']:
                        with open(item_path, "rb") as img_f:
                            b64 = base64.b64encode(img_f.read()).decode('utf-8')
                            output_files.append({
                                "type": "image", 
                                "name": item, 
                                "data": f"data:image/{ext};base64,{b64}"
                            })
                    # 如果是数据表，读取部分内容预览
                    elif ext in ['csv', 'tsv', 'txt']:
                        with open(item_path, "r", encoding="utf-8", errors='replace') as txt_f:
                            content = txt_f.read(1024 * 50) # 最多读取 50KB 避免撑爆内存
                            output_files.append({
                                "type": "text", 
                                "name": item, 
                                "content": content
                            })
                            
            # 5. 清理临时目录 (节省服务器空间)
            shutil.rmtree(workspace_dir, ignore_errors=True)
            
        return {
            "success": success,
            "stdout": stdout,
            "stderr": stderr,
            "files": output_files
        }

sandbox_service = SandboxService()