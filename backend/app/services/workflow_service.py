import os
import subprocess
import csv
from uuid import UUID
from datetime import datetime
from sqlmodel import Session, select
from app.models.user import Analysis, Project, Sample, File, SampleFileLink, SampleSheet

class WorkflowService:
    def __init__(self):
        # === 核心修改：支持 DooD (Docker-out-of-Docker) ===
        # 优先读取宿主机的真实工作路径，以便 Nextflow 发送给 Docker 的路径在宿主机上是有效的
        # 如果未设置，回退到容器内部路径 /app/workspace
        self.base_work_dir = os.getenv("HOST_WORK_DIR", "/app/workspace")
        
        # 确保目录存在
        if not os.path.exists(self.base_work_dir):
            try:
                os.makedirs(self.base_work_dir, exist_ok=True)
            except Exception as e:
                print(f"⚠️ Warning: Could not create work dir {self.base_work_dir}: {e}")

        # 宿主机数据根目录 (用于 input files)
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
                    
                # 拼接绝对路径
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

        with open(output_path, 'w', newline='') as f:
            writer = csv.DictWriter(f, fieldnames=["sample_id", "r1_path", "r2_path"])
            writer.writeheader()
            writer.writerows(rows)

    def run_pipeline(self, session: Session, analysis_id: UUID):
        analysis = session.get(Analysis, analysis_id)
        if not analysis:
            raise ValueError(f"Analysis {analysis_id} not found")
            
        # 使用 base_work_dir (可能是宿主机路径)
        run_dir = os.path.join(self.base_work_dir, str(analysis.id))
        results_dir = os.path.join(run_dir, "results")
        
        os.makedirs(run_dir, exist_ok=True)
        os.makedirs(results_dir, exist_ok=True)
        
        log_file_path = os.path.join(run_dir, "analysis.log")

        def write_log(message: str):
            timestamp = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
            try:
                with open(log_file_path, "a") as f:
                    f.write(f"[{timestamp}] {message}\n")
            except Exception:
                pass

        write_log(f"--- Analysis Started: {analysis.id} ---")
        write_log(f"📂 Work Dir: {run_dir}")

        if not analysis.sample_sheet_id:
            write_log("❌ Error: No SampleSheet associated.")
            analysis.status = "failed"
            session.add(analysis)
            session.commit()
            return

        try:
            write_log("📝 Generating samplesheet...")
            samplesheet_path = os.path.join(run_dir, "samplesheet.csv")
            self.generate_samplesheet(session, analysis.sample_sheet_id, samplesheet_path)
            write_log("✅ Samplesheet generated.")
        except Exception as e:
            write_log(f"❌ Error generating samplesheet: {e}")
            analysis.status = "failed"
            session.add(analysis)
            session.commit()
            return

        # 这里的 pipeline path 仍然是容器内的相对路径 /app/pipelines/...
        # 只要 backend 容器能读到即可，Nextflow 会处理
        pipeline_name = analysis.workflow 
        pipeline_path = os.path.abspath(f"pipelines/{pipeline_name}/main.nf")
        
        if not os.path.exists(pipeline_path):
             pipeline_path = os.path.abspath("pipelines/simple_demo/main.nf")
             if not os.path.exists(pipeline_path):
                 write_log("❌ No pipeline script found.")
                 analysis.status = "failed"
                 session.add(analysis)
                 session.commit()
                 return

        cmd = [
            "nextflow", "run", pipeline_path,
            "--input", samplesheet_path,
            "--outdir", results_dir
        ]
        
        analysis.status = "running"
        analysis.work_dir = run_dir
        session.add(analysis)
        session.commit()
        
        write_log(f"🚀 Executing: {' '.join(cmd)}")
        
        try:
            with open(log_file_path, "a") as f:
                result = subprocess.run(
                    cmd, 
                    cwd=run_dir, 
                    stdout=f, 
                    stderr=f, 
                    text=True
                )
            
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
            write_log("--- Analysis Finished ---")

workflow_service = WorkflowService()