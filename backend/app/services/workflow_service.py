import os
import subprocess
import csv
from uuid import UUID
from datetime import datetime
from sqlmodel import Session, select
from app.models.user import Analysis, Project, Sample, File, SampleFileLink, SampleSheet

class WorkflowService:
    def __init__(self, base_work_dir: str = "workspace"):
        # workspace 目录用于存放 nextflow 的运行日志和过程文件
        self.base_work_dir = os.path.abspath(base_work_dir)
        os.makedirs(self.base_work_dir, exist_ok=True)

        # ⚠️ 核心配置：宿主机上的数据根目录 (Host Path)
        # 这是 Nextflow 进程（运行在宿主机上）去寻找数据文件的地方
        # 请务必核对这个路径是否正确！
        self.host_data_root = os.getenv(
            "HOST_DATA_ROOT", 
            "/opt/data1/public/software/systools/autonome/autonome_data"
        )

    def generate_samplesheet(self, session: Session, project_id: UUID, output_path: str):
        """
        生成 samplesheet.csv (本地直存版 - 零拷贝)
        Nextflow 将直接读取宿主机硬盘上的原始文件
        """
        # 1. 查找 SampleSheet
        sheets = session.exec(select(SampleSheet).where(SampleSheet.project_id == project_id)).all()
        sheet_ids = [s.id for s in sheets]
        
        if not sheet_ids:
            raise ValueError("No sample sheets found")

        # 2. 查找 Samples
        samples = session.exec(select(Sample).where(Sample.sample_sheet_id.in_(sheet_ids))).all()
        
        if not samples:
            raise ValueError("No samples found")

        rows = []
        for sample in samples:
            links = session.exec(select(SampleFileLink).where(SampleFileLink.sample_id == sample.id)).all()
            
            r1_path = ""
            r2_path = ""
            
            for link in links:
                file_rec = session.get(File, link.file_id)
                if not file_rec: continue
                
                # === 核心修改：路径拼接 ===
                # 数据库里的 s3_key 现在存储的是 "project_id/filename"
                if not file_rec.s3_key: 
                    print(f"⚠️ File {file_rec.filename} missing path info")
                    continue
                    
                # 拼接出宿主机上的绝对路径
                # 例如: /opt/.../autonome_data/UUID/reads_1.fq.gz
                abs_path = os.path.join(self.host_data_root, file_rec.s3_key)
                
                # 可选：检查路径是否存在
                # 注意：Python 代码是在 Docker 里跑的，它能看到的路径是 /data/uploads/...
                # 但我们要生成给 Host 上 Nextflow 用的路径，所以这里不能用 os.path.exists(abs_path) 来判断
                # 除非我们做一个 Docker 路径到 Host 路径的映射检查，这里暂且相信 DB 记录
                
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

        # 3. 写入 CSV
        with open(output_path, 'w', newline='') as f:
            writer = csv.DictWriter(f, fieldnames=["sample_id", "r1_path", "r2_path"])
            writer.writeheader()
            writer.writerows(rows)

    def run_pipeline(self, session: Session, analysis_id: UUID):
        """驱动 Nextflow"""
        analysis = session.get(Analysis, analysis_id)
        if not analysis:
            raise ValueError(f"Analysis {analysis_id} not found")
            
        # 准备目录
        run_dir = os.path.join(self.base_work_dir, str(analysis.id))
        results_dir = os.path.join(run_dir, "results")
        
        os.makedirs(run_dir, exist_ok=True)
        os.makedirs(results_dir, exist_ok=True)
        
        log_file_path = os.path.join(run_dir, "analysis.log")

        def write_log(message: str):
            timestamp = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
            with open(log_file_path, "a") as f:
                f.write(f"[{timestamp}] {message}\n")

        write_log(f"--- Analysis Started: {analysis.id} ---")

        # 1. 生成 SampleSheet
        try:
            write_log("📝 Generating samplesheet (Direct Path Mode)...")
            samplesheet_path = os.path.join(run_dir, "samplesheet.csv")
            
            self.generate_samplesheet(session, analysis.project_id, samplesheet_path)
            
            write_log("✅ Samplesheet generated.")
        except Exception as e:
            write_log(f"❌ Error generating samplesheet: {e}")
            analysis.status = "failed"
            session.add(analysis)
            session.commit()
            return

        # 2. 定位流程
        pipeline_name = analysis.workflow 
        pipeline_path = os.path.abspath(f"pipelines/{pipeline_name}/main.nf")
        
        if not os.path.exists(pipeline_path):
             write_log(f"⚠️ Workflow {pipeline_name} not found, falling back to simple_demo")
             pipeline_path = os.path.abspath("pipelines/simple_demo/main.nf")

        # 3. 构建命令
        cmd = [
            "nextflow", "run", pipeline_path,
            "--input", samplesheet_path,
            "--outdir", results_dir,
            "-with-docker",
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