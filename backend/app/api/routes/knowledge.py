from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session
from pydantic import BaseModel
from typing import List
import uuid

from app.core.db import get_session
from app.api.deps import get_current_user
from app.models.user import User, Project
from app.services.knowledge_service import knowledge_service

router = APIRouter()

class IngestRequest(BaseModel):
    accession: str
    title: str
    summary: str
    url: str

class SearchRequest(BaseModel):
    query: str
    top_k: int = 5

class ImportRequest(BaseModel):
    dataset_id: str
    project_id: str

@router.post("/ingest")
def ingest_dataset(payload: IngestRequest, db: Session = Depends(get_session)):
    try:
        dataset = knowledge_service.ingest_geo_dataset(
            db=db, accession=payload.accession,
            raw_title=payload.title, raw_summary=payload.summary, url=payload.url
        )
        return {"status": "success", "accession": dataset.accession}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/search")
def search_datasets(payload: SearchRequest, db: Session = Depends(get_session)):
    try:
        results = knowledge_service.semantic_search(db, payload.query, payload.top_k)
        out = []
        for d in results:
            out.append({
                "id": str(d.id), "accession": d.accession, "title": d.title,
                "summary": d.summary, "organism": d.organism,
                "disease_state": d.disease_state, "sample_count": d.sample_count, "url": d.url
            })
        return out
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# 👇 新增的一键导入接口
@router.post("/import")
def import_dataset(
    payload: ImportRequest, 
    db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    try:
        # 验证用户是否有权访问该项目
        project = db.get(Project, uuid.UUID(payload.project_id))
        if not project or project.owner_id != current_user.id:
            raise HTTPException(status_code=403, detail="Permission denied for this project")
            
        # 触发导入逻辑
        knowledge_service.import_to_project(
            db=db, 
            dataset_id=payload.dataset_id, 
            project_id=payload.project_id, 
            user_id=current_user.id
        )
        return {"status": "success", "message": "Dataset imported successfully."}
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))