import os
import subprocess
import csv
import json
import uuid
from uuid import UUID
import traceback
from datetime import datetime
from sqlmodel import Session, select
from app.models.user import Analysis, Project, Sample, File, SampleFileLink, SampleSheet
from app.models.bio import WorkflowTemplate

class WorkflowService:
    def __init__(self):
        # 1. 工作目录
        self.base_work_dir = os.getenv("HOST_WORK_DIR", "/opt/data1/public/software/systools/autonome/autonome_workspace")
        
        if not os.path.exists(self.base_work_dir):
            try:
                os.makedirs(self.base_work_dir, exist_ok=True)
            except Exception as e:
                print(f"⚠️ Warning: Could not create work dir {self.base_work_dir}: {e}")

        # 2. 数据目录
        self.host_data_root = os.getenv(
            "HOST_DATA_ROOT", 
            "/opt/data1/public/software/systools/autonome/autonome_data"
        )

        # 3. 宿主机 Conda 环境持久化目录
        self.host_conda_dir = os.getenv(
            "HOST_CONDA_DIR",
            "/opt/data1/public/software/systools/autonome/autonome_conda"
        )

    def generate_samplesheet(self, session: Session, sample_sheet_id: UUID, output_path: str):
        sheet = session.get(SampleSheet, sample_sheet_id)
        if not sheet:
            raise ValueError(f"Sample sheet {sample_sheet_id} not found")

        samples = session.exec(select(Sample).where(Sample.sample_sheet_id == sample_sheet_id)).all()
        if not samples:
            raise ValueError("No samples found in this sheet")

        # 优化：使用批量查询替代 N+1 查询
        # 1. 获取所有样本的 ID
        sample_ids = [s.id for s in samples]
        
        # 2. 一次性获取所有相关的 SampleFileLink
        links = session.exec(
            select(SampleFileLink).where(SampleFileLink.sample_id.in_(sample_ids))
        ).all()
        
        # 3. 一次性获取所有相关的 File 记录
        file_ids = [link.file_id for link in links]
        files = session.exec(select(File).where(File.id.in_(file_ids))).all()
        
        # 4. 在内存中构建映射
        file_map = {f.id: f for f in files}
        links_by_sample = {}
        for link in links:
            if link.sample_id not in links_by_sample:
                links_by_sample[link.sample_id] = []
            links_by_sample[link.sample_id].append(link)
        
        rows = []
        for sample in samples:
            sample_links = links_by_sample.get(sample.id, [])
            r1_path = ""
            r2_path = ""
            
            for link in sample_links:
                file_rec = file_map.get(link.file_id)
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

        template = session.exec(
            select(WorkflowTemplate).where(WorkflowTemplate.script_path == analysis.workflow)
        ).first()
        
        task_type = template.workflow_type if template else "PIPELINE"

        try:
            # ==========================================
            # 🛠️ 模式 A: 独立脚本工具 (TOOL)
            # ==========================================
            if task_type == "TOOL":
                write_log("🛠️ Mode: Standalone Tool Task")
                if not template or not template.source_code:
                    raise ValueError("Tool source code is missing in the database.")

                params_dict = json.loads(analysis.params_json) if analysis.params_json else {}
                write_log(f"⚙️ Tool Parameters: {json.dumps(params_dict, ensure_ascii=False)}")

                code = template.source_code
                docker_image = "autonome-tool-env:latest"

                if "library(" in code or "<-" in code:
                    script_name = "script.R"
                    exec_cmd = ["Rscript"]
                elif "use strict" in code or "perl " in code.lower():
                    script_name = "script.pl"
                    exec_cmd = ["perl"]
                else:
                    script_name = "script.py"
                    exec_cmd = ["python"] 

                # 脚本依然保存在 run_dir 根目录，避免污染 results
                script_path = os.path.join(run_dir, script_name)
                with open(script_path, "w", encoding="utf-8") as f:
                    f.write(code)
                write_log(f"📄 Saved tool script as {script_name}")

                script_args = []
                for key, val in params_dict.items():
                    if val is not None and str(val).strip() != "":
                        if isinstance(val, bool):
                            if val: script_args.append(f"--{key}")
                        else:
                            script_args.extend([f"--{key}", str(val)])

                # 👇 关键修改：
                # 1. 将容器内工作目录设置为 results 子目录
                # 2. 调用上层目录的脚本 (../script.py)
                # 这样脚本生成的所有文件都会自动落在 results 目录中
                
                command_to_run = exec_cmd + [f"../{script_name}"] + script_args

                docker_run_cmd = [
                    "docker", "run", "--rm",
                    "--pull", "never",
                    "-v", f"{self.base_work_dir}:{self.base_work_dir}",
                    "-v", f"{self.host_data_root}:/data/uploads",
                    "-v", f"{self.host_conda_dir}:/opt/conda",
                    
                    # 设置工作目录为 results 文件夹
                    "-w", results_dir, 
                    "-u", "root",
                    docker_image
                ] + command_to_run

                write_log(f"🐳 Launching Container...")
                write_log(f"🚀 Command: {' '.join(docker_run_cmd)}")

                with open(log_file_path, "a", encoding="utf-8") as f:
                    result = subprocess.run(docker_run_cmd, cwd=results_dir, stdout=f, stderr=f, text=True)

                if result.returncode == 0:
                    analysis.status = "completed"
                    write_log("✅ Tool Task Completed Successfully!")
                else:
                    analysis.status = "failed"
                    write_log(f"❌ Tool Task Failed with exit code {result.returncode}")

            # ==========================================
            # 🔗 模式 B: 生信分析流程 (PIPELINE)
            # ==========================================
            else:
                write_log("🔗 Mode: Nextflow Pipeline Task")
                if not analysis.sample_sheet_id:
                    raise ValueError("No SampleSheet associated for Pipeline task.")

                write_log("📝 Generating samplesheet...")
                # SampleSheet 还是放在根目录，作为输入
                samplesheet_path = os.path.join(run_dir, "samplesheet.csv")
                self.generate_samplesheet(session, analysis.sample_sheet_id, samplesheet_path)
                
                params_path = os.path.join(run_dir, "params.json")
                params_dict = json.loads(analysis.params_json) if analysis.params_json else {}
                with open(params_path, "w", encoding="utf-8") as f:
                    json.dump(params_dict, f, indent=2)
                
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

                cmd = [
                    "nextflow",
                    "run", pipeline_path,
                    "--input", samplesheet_path,
                    "--outdir", results_dir, # Nextflow 本身支持 outdir 参数
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
            write_log(f"📜 Traceback: {traceback.format_exc()}")
            
        finally:
            analysis.end_time = datetime.utcnow()
            session.add(analysis)
            session.commit()
            write_log("--- Task Finished ---")

workflow_service = WorkflowService()