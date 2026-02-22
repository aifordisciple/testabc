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

class StructuredMetadata(BaseModel):
    organism: Optional[str] = Field(None, description="The biological species, e.g., 'Homo sapiens', 'Mus musculus'")
    disease_state: Optional[str] = Field(None, description="The disease or condition studied, e.g., 'Lung Cancer', 'Healthy', 'Normal'")
    sample_count: int = Field(0, description="Total number of samples in the dataset")
    cleaned_summary: str = Field(..., description="A concise, easily readable summary of the dataset's purpose and experimental design")

class LLMGeneratedDataset(BaseModel):
    accession: str = Field(..., description="GEO Accession number, e.g., GSE12345. Must be accurate.")
    title: str = Field(..., description="Title of the dataset")
    summary: str = Field(..., description="Detailed summary of the experimental design and purpose")
    url: Optional[str] = Field(None, description="URL to the dataset")

class LLMDatasetSearchResult(BaseModel):
    datasets: List[LLMGeneratedDataset] = Field(description="List of highly relevant public datasets matching the user query")

class KnowledgeService:
    def __init__(self):
        self.base_url = os.getenv("LLM_BASE_URL", "http://host.docker.internal:11434/v1")
        self.api_key = os.getenv("LLM_API_KEY", "ollama")
        self.llm_model = os.getenv("LLM_MODEL", "qwen2.5-coder:32b")
        self.embed_model = os.getenv("EMBEDDING_MODEL", "bge-m3")
        
        self.client = OpenAI(base_url=self.base_url, api_key=self.api_key)
        self.instructor_client = instructor.from_openai(self.client, mode=instructor.Mode.JSON)

    def get_embedding(self, text: str) -> List[float]:
        response = self.client.embeddings.create(
            input=text.replace("\n", " "),
            model=self.embed_model
        )
        return response.data[0].embedding

    def clean_metadata_with_llm(self, raw_text: str) -> StructuredMetadata:
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
        existing = db.exec(select(PublicDataset).where(PublicDataset.accession == accession)).first()
        if existing:
            return existing
            
        structured_data = self.clean_metadata_with_llm(f"Title: {raw_title}\nSummary: {raw_summary}")
        search_text = f"Title: {raw_title}. Disease: {structured_data.disease_state}. Summary: {structured_data.cleaned_summary}"
        embedding = self.get_embedding(search_text)
        
        dataset = PublicDataset(
            accession=accession, title=raw_title, summary=structured_data.cleaned_summary,
            organism=structured_data.organism, disease_state=structured_data.disease_state,
            sample_count=structured_data.sample_count, url=url,
            structured_metadata=structured_data.model_dump_json(exclude_none=True),
            embedding=embedding
        )
        db.add(dataset)
        db.commit()
        db.refresh(dataset)
        return dataset

    # 👇 核心升级：改造成流式生成器 (Streaming Generator)
    def agentic_geo_search_stream(self, db: Session, user_query: str, top_k: int = 5):
        # 1. 汇报第一步状态：正在召唤大模型
        yield json.dumps({"status": "translating", "message": "🤖 AI is reasoning and recalling datasets..."}) + "\n"
        
        prompt = f"""You are an expert bioinformatics data curator.
The user is searching for public transcriptomic, genomic, or clinical datasets (like GEO, TCGA, ArrayExpress).
User query: "{user_query}"
Based on your vast training knowledge, provide up to {top_k} REAL and HIGHLY RELEVANT public datasets that match this query.
Ensure that the accession numbers and summaries are accurate.
"""
        try:
            search_result = self.instructor_client.chat.completions.create(
                model=self.llm_model, response_model=LLMDatasetSearchResult,
                messages=[{"role": "user", "content": prompt}], temperature=0.2
            )
            raw_datasets = search_result.datasets
        except Exception as e:
            yield json.dumps({"status": "error", "message": f"LLM retrieval failed: {e}"}) + "\n"
            return

        # 2. 汇报第二步状态：拿到列表，准备对比数据库
        yield json.dumps({"status": "fetching", "message": f"🔍 AI recalled {len(raw_datasets)} datasets. Cross-checking with database..."}) + "\n"

        results = []
        for idx, ds in enumerate(raw_datasets):
            # 3. 循环汇报：正在处理哪一个数据集
            yield json.dumps({"status": "processing", "message": f"⏳ Processing {ds.accession} ({idx+1}/{len(raw_datasets)})..."}) + "\n"
            
            dataset_url = ds.url if ds.url else f"https://www.ncbi.nlm.nih.gov/geo/query/acc.cgi?acc={ds.accession}"
            try:
                dataset_record = self.ingest_geo_dataset(db, ds.accession, ds.title, ds.summary, dataset_url)
                results.append(dataset_record)
            except Exception as e:
                print(f"⚠️ Error processing {ds.accession}: {e}")

        out = []
        for d in results:
            out.append({
                "id": str(d.id), "accession": d.accession, "title": d.title,
                "summary": d.summary, "organism": d.organism,
                "disease_state": d.disease_state, "sample_count": d.sample_count, "url": d.url
            })
            
        # 4. 最终步：打上完成标记，并将最终数据推送过去
        yield json.dumps({"status": "complete", "message": "✅ Data is ready!", "data": out}) + "\n"

    def import_to_project(self, db: Session, dataset_id: str, project_id: str, user_id: str):
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