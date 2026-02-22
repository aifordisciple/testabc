import json
import uuid
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse # 👈 引入流式响应
from sqlmodel import Session
from pydantic import BaseModel

from app.core.db import get_session
from app.api.deps import get_current_user
from app.models.user import User, Project
from app.services.knowledge_service import knowledge_service

router = APIRouter()

class SearchRequest(BaseModel):
    query: str
    top_k: int = 5

class ImportRequest(BaseModel):
    dataset_id: str
    project_id: str

# 👇 将原来的普通 POST 改为支持读取 Generator 的流式接口
@router.post("/search")
def search_datasets(payload: SearchRequest, db: Session = Depends(get_session)):
    def stream_generator():
        try:
            # 持续 yield 出服务的状态
            for chunk in knowledge_service.agentic_geo_search_stream(db, payload.query, payload.top_k):
                yield chunk
        except Exception as e:
            yield json.dumps({"status": "error", "message": str(e)}) + "\n"

    # 使用 application/x-ndjson (Newline Delimited JSON) 让前端逐行读取
    return StreamingResponse(stream_generator(), media_type="application/x-ndjson")

@router.post("/import")
def import_dataset(
    payload: ImportRequest, 
    db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    try:
        project = db.get(Project, uuid.UUID(payload.project_id))
        if not project or project.owner_id != current_user.id:
            raise HTTPException(status_code=403, detail="Permission denied")
            
        knowledge_service.import_to_project(
            db=db, dataset_id=payload.dataset_id, project_id=payload.project_id, user_id=current_user.id
        )
        return {"status": "success"}
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))