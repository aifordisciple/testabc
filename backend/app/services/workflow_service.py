import os
import subprocess
import csv
import json
from uuid import UUID
from datetime import datetime
from sqlmodel import Session, select
from app.models.user import Analysis, Project, Sample, File, SampleFileLink, SampleSheet
# 👇 引入 WorkflowTemplate 以获取 AI 生成的脚本代码
from app.models.bio import WorkflowTemplate

class WorkflowService:
    def __init__(self):
        # 优先读取宿主机的真实工作路径 (用于 Docker 挂载映射)
        self.base_work_dir = os.getenv("HOST_WORK_DIR", "/app/workspace")
        
        if not os.path.exists(self.base_work_dir):
            try:
                os.makedirs(self.base_work_dir, exist_ok=True)
            except Exception as e:
                print(f"⚠️ Warning: Could not create work dir {self.base_work_dir}: {e}")

        # 宿主机真实数据根目录 (用于 Docker 挂载映射到 /data/uploads)
        self.host_data_root = os.getenv(
            "HOST_DATA_ROOT", 
            "/opt/data1/public/software/systools/autonome/autonome_data"
        )

    def generate_samplesheet(self, session: Session, sample_sheet_id: UUID, output_path: str):
        sheet = session.get(SampleSheet, sample_sheet_id)
        if not sheet:
            raise ValueError(f"Sample sheet {sample_sheet_id} not found")

        samples = session.exec(select(Sample).where(Sample.sample_sheet_id == sample_sheet_id)).all()
        if not samples:
            raise ValueError("No samples found in this sheet")

        rows = []
        for sample in samples:
            links = session.exec(select(SampleFileLink).where(SampleFileLink.sample_id == sample.id)).all()
            r1_path = ""
            r2_path = ""
            
            for link in links:
                file_rec = session.get(File, link.file_id)
                if not file_rec: continue
                if not file_rec.s3_key: continue
                    
                abs_path = os.path.join(self.host_data_root, file_rec.s3_key)
                
                if link.file_role == "R1":
                    r1_path = abs_path
                elif link.file_role == "R2":
                    r2_path = abs_path
            
            if r1_path:
                rows.append({
                    "sample_id": sample.name,
                    "r1_path": r1_path,
                    "r2_path": r2_path
                })

        if not rows:
             raise ValueError("No valid R1 files found for samples")

        with open(output_path, 'w', newline='', encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=["sample_id", "r1_path", "r2_path"])
            writer.writeheader()
            writer.writerows(rows)

    def run_pipeline(self, session: Session, analysis_id: UUID):
        analysis = session.get(Analysis, analysis_id)
        if not analysis:
            raise ValueError(f"Analysis {analysis_id} not found")
            
        run_dir = os.path.join(self.base_work_dir, str(analysis.id))
        results_dir = os.path.join(run_dir, "results")
        
        os.makedirs(run_dir, exist_ok=True)
        os.makedirs(results_dir, exist_ok=True)
        
        log_file_path = os.path.join(run_dir, "analysis.log")

        def write_log(message: str):
            timestamp = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
            try:
                with open(log_file_path, "a", encoding="utf-8") as f:
                    f.write(f"[{timestamp}] {message}\n")
            except Exception:
                pass

        write_log(f"--- Task Started: {analysis.id} ---")
        write_log(f"📂 Work Dir: {run_dir}")

        analysis.status = "running"
        analysis.work_dir = run_dir
        session.add(analysis)
        session.commit()

        # 获取数据库中的模板代码和类型
        template = session.exec(
            select(WorkflowTemplate).where(WorkflowTemplate.script_path == analysis.workflow)
        ).first()
        
        task_type = template.workflow_type if template else "PIPELINE"

        try:
            # ==========================================
            # 🛠️ 模式 A: 独立脚本工具 (TOOL) - Docker 隔离执行
            # ==========================================
            if task_type == "TOOL":
                write_log("🛠️ Mode: Standalone Tool Task (Docker Isolated)")
                if not template or not template.source_code:
                    raise ValueError("Tool source code is missing in the database.")

                # 1. 提取参数
                params_dict = json.loads(analysis.params_json) if analysis.params_json else {}
                write_log(f"⚙️ Tool Parameters: {json.dumps(params_dict, ensure_ascii=False)}")

                code = template.source_code
                
                # 2. 智能探测语言，选择对应的 Docker 数据科学镜像
                if "library(" in code or "<-" in code:
                    script_name = "script.R"
                    # rocker/tidyverse 包含 R, ggplot2, dplyr 等强大 R 包
                    docker_image = "autonome-tool-env:latest"
                    exec_cmd = ["Rscript", script_name]
                elif "use strict" in code or "perl " in code.lower():
                    script_name = "script.pl"
                    docker_image = "autonome-tool-env:latest"
                    exec_cmd = ["perl", script_name]
                else:
                    # 默认 Python
                    script_name = "script.py"
                    # jupyter/datascience-notebook 预装了 pandas, numpy, scipy, matplotlib, seaborn 等
                    docker_image = "autonome-tool-env:latest"
                    exec_cmd = ["python", script_name]

                # 保存脚本到物理目录
                script_path = os.path.join(run_dir, script_name)
                with open(script_path, "w", encoding="utf-8") as f:
                    f.write(code)
                write_log(f"📄 Saved tool script as {script_name}")

                # 3. 构造传递给脚本的参数 (--key val)
                script_args = []
                for key, val in params_dict.items():
                    if val is not None and str(val).strip() != "":
                        if isinstance(val, bool):
                            if val: script_args.append(f"--{key}")
                        else:
                            script_args.extend([f"--{key}", str(val)])

                # 4. 构造 Docker 容器执行命令 (Docker-in-Docker 挂载)
                # 注意：由于我们在操作宿主机的 Docker，-v 必须使用宿主机的真实路径
                docker_run_cmd = [
                    "docker", "run", "--rm",
                    # 使用与宿主机相同的运行路径
                    "-v", f"{self.base_work_dir}:{self.base_work_dir}",
                    # 挂载真实的源文件目录到容器内的 /data/uploads 供读取
                    "-v", f"{self.host_data_root}:/data/uploads",
                    # 切换工作目录到当前任务文件夹
                    "-w", run_dir,
                    # 以 root 身份运行防止权限不足无法写入文件 (部分 Jupyter 镜像默认用户非 root)
                    "-u", "root",
                    docker_image
                ] + exec_cmd + script_args

                write_log(f"🐳 Launching Docker Container: {docker_image}")
                write_log(f"🚀 Executing Command: {' '.join(docker_run_cmd)}")

                with open(log_file_path, "a", encoding="utf-8") as f:
                    result = subprocess.run(docker_run_cmd, cwd=run_dir, stdout=f, stderr=f, text=True)

                if result.returncode == 0:
                    analysis.status = "completed"
                    write_log("✅ Tool Task Completed Successfully!")
                else:
                    analysis.status = "failed"
                    write_log(f"❌ Tool Task Failed with exit code {result.returncode}")

            # ==========================================
            # 🔗 模式 B: 生信分析流程 (PIPELINE) - Nextflow 执行
            # ==========================================
            else:
                write_log("🔗 Mode: Nextflow Pipeline Task")
                if not analysis.sample_sheet_id:
                    raise ValueError("No SampleSheet associated for Pipeline task.")

                # 1. 生成 SampleSheet
                write_log("📝 Generating samplesheet...")
                samplesheet_path = os.path.join(run_dir, "samplesheet.csv")
                self.generate_samplesheet(session, analysis.sample_sheet_id, samplesheet_path)
                write_log("✅ Samplesheet generated.")

                # 2. 生成 params.json
                params_path = os.path.join(run_dir, "params.json")
                params_dict = json.loads(analysis.params_json) if analysis.params_json else {}
                with open(params_path, "w", encoding="utf-8") as f:
                    json.dump(params_dict, f, indent=2)
                write_log(f"⚙️ Pipeline Parameters loaded.")

                # 3. 动态加载 Nextflow 源码
                pipeline_path = os.path.abspath(f"pipelines/{analysis.workflow}/main.nf")
                
                if template and template.source_code:
                    write_log("📄 Loading pipeline code from database.")
                    pipeline_path = os.path.join(run_dir, "main.nf")
                    with open(pipeline_path, "w", encoding="utf-8") as f:
                        f.write(template.source_code)
                    
                    if template.config_code:
                        with open(os.path.join(run_dir, "nextflow.config"), "w", encoding="utf-8") as f:
                            f.write(template.config_code)
                else:
                    if not os.path.exists(pipeline_path):
                        pipeline_path = os.path.abspath("pipelines/simple_demo/main.nf")
                        if not os.path.exists(pipeline_path):
                            raise ValueError("No pipeline script found.")

                # 4. 构建并执行 Nextflow 命令
                cmd = [
                    "nextflow",
                    "run", pipeline_path,
                    "--input", samplesheet_path,
                    "--outdir", results_dir,
                    "-params-file", params_path 
                ]
                
                write_log(f"🚀 Executing Pipeline: {' '.join(cmd)}")
                
                with open(log_file_path, "a", encoding="utf-8") as f:
                    result = subprocess.run(cmd, cwd=run_dir, stdout=f, stderr=f, text=True)
                
                if result.returncode == 0:
                    analysis.status = "completed"
                    write_log("✅ Pipeline Success!")
                else:
                    analysis.status = "failed"
                    write_log(f"❌ Pipeline Failed with exit code {result.returncode}")
                
        except Exception as e:
            analysis.status = "error"
            write_log(f"💥 System Error: {str(e)}")
            
        finally:
            analysis.end_time = datetime.utcnow()
            session.add(analysis)
            session.commit()
            write_log("--- Task Finished ---")

workflow_service = WorkflowService()