# backend/app/api/routes/admin.py

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, select
from typing import List, Optional
import uuid
from datetime import datetime

from app.core.db import get_session
from app.api.deps import get_current_user
from app.models.user import User
from app.models.bio import (
    WorkflowTemplate, 
    WorkflowTemplateCreate, 
    WorkflowTemplateUpdate, 
    WorkflowTemplatePublic
)

router = APIRouter()

def check_admin(user: User):
    pass

@router.post("/workflows", response_model=WorkflowTemplatePublic)
def create_workflow_template(
    workflow_in: WorkflowTemplateCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    check_admin(current_user)
    
    existing = session.exec(select(WorkflowTemplate).where(WorkflowTemplate.name == workflow_in.name)).first()
    if existing:
        raise HTTPException(400, "Workflow with this name already exists")
        
    workflow = WorkflowTemplate(**workflow_in.model_dump())
    session.add(workflow)
    session.commit()
    session.refresh(workflow)
    return workflow

@router.get("/workflows", response_model=List[WorkflowTemplatePublic])
def list_workflow_templates(
    category: Optional[str] = None,
    type: Optional[str] = None, 
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    query = select(WorkflowTemplate)
    if category:
        query = query.where(WorkflowTemplate.category == category)
    if type:
        # ⚠️ 修复：使用 workflow_type
        query = query.where(WorkflowTemplate.workflow_type == type)
    
    # ⚠️ 修复：按 workflow_type 排序
    query = query.order_by(WorkflowTemplate.workflow_type, WorkflowTemplate.category, WorkflowTemplate.name)
    return session.exec(query).all()

@router.get("/workflows/{workflow_id}", response_model=WorkflowTemplatePublic)
def get_workflow_template(
    workflow_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    workflow = session.get(WorkflowTemplate, workflow_id)
    if not workflow:
        raise HTTPException(404, "Workflow not found")
    return workflow

@router.patch("/workflows/{workflow_id}", response_model=WorkflowTemplatePublic)
def update_workflow_template(
    workflow_id: uuid.UUID,
    workflow_update: WorkflowTemplateUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    check_admin(current_user)
    
    workflow = session.get(WorkflowTemplate, workflow_id)
    if not workflow:
        raise HTTPException(404, "Workflow not found")
        
    workflow_data = workflow_update.model_dump(exclude_unset=True)
    for key, value in workflow_data.items():
        setattr(workflow, key, value)
    
    workflow.updated_at = datetime.utcnow()
    session.add(workflow)
    session.commit()
    session.refresh(workflow)
    return workflow

@router.delete("/workflows/{workflow_id}")
def delete_workflow_template(
    workflow_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    check_admin(current_user)
    
    workflow = session.get(WorkflowTemplate, workflow_id)
    if not workflow:
        raise HTTPException(404, "Workflow not found")
        
    session.delete(workflow)
    session.commit()
    return {"status": "deleted"}