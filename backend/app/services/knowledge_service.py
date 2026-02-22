import os
import json
import uuid
import instructor
from openai import OpenAI
from pydantic import BaseModel, Field
from typing import Optional, List
from sqlmodel import Session, select
from app.models.knowledge import PublicDataset
from app.models.user import Project, File, ProjectFileLink

# ==========================================
# Pydantic 结构化模型定义
# ==========================================

class StructuredMetadata(BaseModel):
    """用于存储大模型清洗后的高度结构化元数据"""
    organism: Optional[str] = Field(None, description="The biological species, e.g., 'Homo sapiens', 'Mus musculus'")
    disease_state: Optional[str] = Field(None, description="The disease or condition studied, e.g., 'Lung Cancer', 'Healthy', 'Normal'")
    sample_count: int = Field(0, description="Total number of samples in the dataset")
    cleaned_summary: str = Field(..., description="A concise, easily readable summary of the dataset's purpose and experimental design")

class LLMGeneratedDataset(BaseModel):
    """用于约束大模型直接搜索并返回的数据集格式"""
    accession: str = Field(..., description="GEO Accession number, e.g., GSE12345. Must be accurate.")
    title: str = Field(..., description="Title of the dataset")
    summary: str = Field(..., description="Detailed summary of the experimental design and purpose")
    url: str = Field(..., description="URL to the dataset, typically https://www.ncbi.nlm.nih.gov/geo/query/acc.cgi?acc=...")

class LLMDatasetSearchResult(BaseModel):
    """大模型搜索结果列表"""
    datasets: List[LLMGeneratedDataset] = Field(description="List of highly relevant public datasets matching the user query")

# ==========================================
# Knowledge Service 核心业务逻辑
# ==========================================

class KnowledgeService:
    def __init__(self):
        # 参数系统设置
        # self.base_url = os.getenv("LLM_BASE_URL", "http://host.docker.internal:11434/v1")
        # self.api_key = os.getenv("LLM_API_KEY", "ollama")
        # self.llm_model = os.getenv("LLM_MODEL", "qwen2.5-coder:32b")
        # self.embed_model = os.getenv("EMBEDDING_MODEL", "bge-m3")

        self.base_url = "http://host.docker.internal:11434/v1"
        self.api_key = "ollama"
        self.llm_model = "qwen3.5:cloud"
        # 默认使用 bge-m3 作为向量模型
        self.embed_model = "bge-m3"

        # 初始化带 JSON 约束的 LLM 客户端
        self.client = OpenAI(base_url=self.base_url, api_key=self.api_key)
        self.instructor_client = instructor.from_openai(self.client, mode=instructor.Mode.JSON)

    def get_embedding(self, text: str) -> List[float]:
        """获取文本的向量表示"""
        response = self.client.embeddings.create(
            input=text.replace("\n", " "),
            model=self.embed_model
        )
        return response.data[0].embedding

    def clean_metadata_with_llm(self, raw_text: str) -> StructuredMetadata:
        """调用大模型深度清洗原始文本，提取实验关键信息"""
        prompt = f"Extract the key experimental metadata from the following dataset description:\n\n{raw_text}"
        metadata = self.instructor_client.chat.completions.create(
            model=self.llm_model,
            response_model=StructuredMetadata,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.1,
            max_retries=2
        )
        return metadata

    def ingest_geo_dataset(self, db: Session, accession: str, raw_title: str, raw_summary: str, url: str) -> PublicDataset:
        """
        核心 ETL 入库逻辑：包含严格的查重防御
        """
        # 🛡️ 查重机制：如果数据库已经存在该 GEO 号，直接跳过并返回本地记录
        existing = db.exec(select(PublicDataset).where(PublicDataset.accession == accession)).first()
        if existing:
            print(f"✅ [Knowledge ETL] Dataset {accession} already in DB. Skipping processing.", flush=True)
            return existing
            
        print(f"🧠 [Knowledge ETL] Processing new dataset {accession} via LLM...", flush=True)
        # 清洗
        structured_data = self.clean_metadata_with_llm(f"Title: {raw_title}\nSummary: {raw_summary}")
        
        # 向量化 (将标题、疾病状态和清洗后的摘要拼接作为核心检索内容)
        search_text = f"Title: {raw_title}. Disease: {structured_data.disease_state}. Summary: {structured_data.cleaned_summary}"
        embedding = self.get_embedding(search_text)
        
        # 写入数据库
        dataset = PublicDataset(
            accession=accession,
            title=raw_title,
            summary=structured_data.cleaned_summary,
            organism=structured_data.organism,
            disease_state=structured_data.disease_state,
            sample_count=structured_data.sample_count,
            url=url,
            structured_metadata=structured_data.model_dump_json(exclude_none=True),
            embedding=embedding
        )
        db.add(dataset)
        db.commit()
        db.refresh(dataset)
        return dataset

    def semantic_search(self, db: Session, query: str, top_k: int = 5) -> List[PublicDataset]:
        """纯本地的向量检索 (备用)"""
        query_embedding = self.get_embedding(query)
        distance_threshold = 0.6 
        return db.exec(
            select(PublicDataset)
            .where(PublicDataset.embedding.cosine_distance(query_embedding) < distance_threshold)
            .order_by(PublicDataset.embedding.cosine_distance(query_embedding))
            .limit(top_k)
        ).all()

    # 👇 核心升级：基于 LLM 参数记忆的生成式检索
    def agentic_geo_search(self, db: Session, user_query: str, top_k: int = 5) -> List[PublicDataset]:
        """
        让大模型直接化身检索引擎，从自身参数记忆中输出匹配的数据集
        """
        print(f"🤖 [Agentic Search] Asking LLM to directly recall datasets for: '{user_query}'", flush=True)
        
        prompt = f"""You are an expert bioinformatics data curator.
The user is searching for public transcriptomic, genomic, or clinical datasets (like GEO, TCGA, ArrayExpress).
User query: "{user_query}"

Based on your vast training knowledge, provide up to {top_k} REAL and HIGHLY RELEVANT public datasets that match this query.
Ensure that the accession numbers (e.g., GSE12345) and summaries are as accurate as possible based on published literature.
"""
        try:
            # 1. 直接让大模型按格式吐出查到的数据集列表
            search_result = self.instructor_client.chat.completions.create(
                model=self.llm_model,
                response_model=LLMDatasetSearchResult,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.2 # 较低的温度以减少大模型产生虚假 GSE 号(幻觉)的概率
            )
            raw_datasets = search_result.datasets
        except Exception as e:
            print(f"⚠️ [Agentic Search] LLM direct retrieval failed: {e}", flush=True)
            return []

        # 2. 对比数据库并聚合返回结果
        results = []
        for ds in raw_datasets:
            print(f"🔍 [Agentic Search] LLM suggested dataset: {ds.accession}", flush=True)
            # 调用入库逻辑：存在的直接取本地，不存在的经过清洗与向量化后入库
            dataset_record = self.ingest_geo_dataset(
                db=db,
                accession=ds.accession,
                raw_title=ds.title,
                raw_summary=ds.summary,
                url=ds.url or f"https://www.ncbi.nlm.nih.gov/geo/query/acc.cgi?acc={ds.accession}"
            )
            results.append(dataset_record)
        
        return results

    def import_to_project(self, db: Session, dataset_id: str, project_id: str, user_id: str):
        """一键导入模拟逻辑：写入物理文件并关联数据库"""
        dataset = db.get(PublicDataset, dataset_id)
        if not dataset: raise ValueError("Dataset not found")
        
        folder_name = f"Imported_{dataset.accession}"
        folder_key = f"{project_id}/_folders/{uuid.uuid4()}/"
        new_folder = File(filename=folder_name, size=0, content_type="application/x-directory", is_directory=True, s3_key=folder_key, uploader_id=user_id)
        db.add(new_folder)
        db.commit()
        db.refresh(new_folder)
        db.add(ProjectFileLink(project_id=project_id, file_id=new_folder.id))
        db.commit()

        upload_root = os.getenv("UPLOAD_ROOT", "/data/uploads")
        save_dir = os.path.join(upload_root, str(project_id), folder_name)
        os.makedirs(save_dir, exist_ok=True)
        
        readme_name, readme_path = f"{dataset.accession}_README.md", os.path.join(save_dir, f"{dataset.accession}_README.md")
        with open(readme_path, "w", encoding="utf-8") as f:
            f.write(f"# {dataset.title}\n\n**Organism:** {dataset.organism}\n**Disease:** {dataset.disease_state}\n**Samples:** {dataset.sample_count}\n\n## Summary\n{dataset.summary}\n\n[View Original Source]({dataset.url})")
            
        meta_name, meta_path = f"{dataset.accession}_metadata.json", os.path.join(save_dir, f"{dataset.accession}_metadata.json")
        with open(meta_path, "w", encoding="utf-8") as f:
            f.write(dataset.structured_metadata)

        for fname, fpath in [(readme_name, readme_path), (meta_name, meta_path)]:
            db_file = File(filename=fname, size=os.path.getsize(fpath), content_type="text/plain" if fname.endswith(".md") else "application/json", s3_key=os.path.join(str(project_id), folder_name, fname), uploader_id=user_id, parent_id=new_folder.id)
            db.add(db_file)
            db.commit()
            db.refresh(db_file)
            db.add(ProjectFileLink(project_id=project_id, file_id=db_file.id))
            db.commit()
            
        return new_folder

knowledge_service = KnowledgeService()