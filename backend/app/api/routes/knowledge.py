import json
import uuid
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlmodel import Session
from pydantic import BaseModel

from app.core.db import get_session
from app.api.deps import get_current_user
from app.models.user import User, Project
from app.services.knowledge_service import knowledge_service

router = APIRouter()

# ==========================================
# 1. 参数系统定义 (包含默认值)
# ==========================================
class IngestRequest(BaseModel):
    accession: str
    title: str
    summary: str
    url: str

class SearchRequest(BaseModel):
    query: str
    top_k: int = 5
    # 👇 新增：检索模式参数，默认值为 'llm'
    # 'llm': 调用大模型直接召回并清洗入库
    # 'vector': 直接利用 pgvector 计算余弦距离快速召回本地数据
    mode: str = "llm" 

class ImportRequest(BaseModel):
    dataset_id: str
    project_id: str

# ==========================================
# 2. 接口层实现 (程序说明详细注释)
# ==========================================
@router.post("/ingest")
def ingest_dataset(payload: IngestRequest, db: Session = Depends(get_session)):
    """手动录入并让大模型进行清洗和向量化"""
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
    """
    智能知识库搜索引擎 (支持流式返回前端以实现动态打字机效果)
    包含两套底层逻辑的无缝切换。
    """
    def stream_generator():
        try:
            if payload.mode == "vector":
                # ---------------------------------------------
                # 模式 A: 极速本地向量检索
                # ---------------------------------------------
                # 1. 瞬间推一条状态信息给前端
                yield json.dumps({"status": "fetching", "message": "⚡ Running fast local vector search..."}) + "\n"
                
                # 2. 调用服务层向量比对算法
                results = knowledge_service.semantic_search(db, payload.query, payload.top_k)
                
                # 3. 组装结果
                out = []
                for d in results:
                    out.append({
                        "id": str(d.id), "accession": d.accession, "title": d.title,
                        "summary": d.summary, "organism": d.organism,
                        "disease_state": d.disease_state, "sample_count": d.sample_count, "url": d.url
                    })
                
                # 4. 瞬间推送 "complete" 指令连带数据，完美兼容前端原有的解析流
                yield json.dumps({"status": "complete", "message": "✅ Local search complete!", "data": out}) + "\n"
                
            else:
                # ---------------------------------------------
                # 模式 B: LLM 联网与推理检索 (原有逻辑)
                # ---------------------------------------------
                # 直接桥接底层知识库服务提供的生成器
                for chunk in knowledge_service.agentic_geo_search_stream(db, payload.query, payload.top_k):
                    yield chunk
                    
        except Exception as e:
            # 捕获全局异常并作为错误流推给前端
            yield json.dumps({"status": "error", "message": str(e)}) + "\n"

    # 声明返回为 NDJSON 格式，支持逐行持续下载
    return StreamingResponse(stream_generator(), media_type="application/x-ndjson")

@router.post("/import")
def import_dataset(
    payload: ImportRequest, 
    db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """一键导入公共数据到用户私有工作区项目内"""
    try:
        project = db.get(Project, uuid.UUID(payload.project_id))
        if not project or project.owner_id != current_user.id:
            raise HTTPException(status_code=403, detail="Permission denied for this project")
            
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