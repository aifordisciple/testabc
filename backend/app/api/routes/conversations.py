from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from typing import List
from uuid import UUID
from datetime import datetime
import json

from app.core.db import get_session
from app.api.deps import get_current_user
from app.models.user import User, Project
from app.models.conversation import (
    Conversation, ConversationMessage,
    ConversationCreate, ConversationPublic, ConversationDetail,
    MessageCreate, MessagePublic
)

router = APIRouter()

@router.get("/projects/{project_id}/conversations", response_model=List[ConversationPublic])
def list_conversations(
    project_id: UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
    include_archived: bool = False
):
    """获取项目的所有对话"""
    project = session.get(Project, project_id)
    if not project or project.owner_id != current_user.id:
        raise HTTPException(status_code=404, detail="Project not found")
    
    query = select(Conversation).where(Conversation.project_id == project_id)
    if not include_archived:
        query = query.where(Conversation.is_archived == False)
    query = query.order_by(Conversation.updated_at.desc())
    
    conversations = session.exec(query).all()
    
    result = []
    for conv in conversations:
        msg_count = session.exec(
            select(ConversationMessage)
            .where(ConversationMessage.conversation_id == conv.id)
        ).all()
        result.append(ConversationPublic(
            id=conv.id,
            project_id=conv.project_id,
            title=conv.title,
            summary=conv.summary,
            created_at=conv.created_at,
            updated_at=conv.updated_at,
            is_archived=conv.is_archived,
            message_count=len(msg_count)
        ))
    
    return result

@router.post("/projects/{project_id}/conversations", response_model=ConversationPublic)
def create_conversation(
    project_id: UUID,
    conv_in: ConversationCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """创建新对话"""
    project = session.get(Project, project_id)
    if not project or project.owner_id != current_user.id:
        raise HTTPException(status_code=404, detail="Project not found")
    
    conversation = Conversation(
        project_id=project_id,
        title=conv_in.title or "新对话",
        summary=conv_in.summary
    )
    session.add(conversation)
    session.commit()
    session.refresh(conversation)
    
    return ConversationPublic(
        id=conversation.id,
        project_id=conversation.project_id,
        title=conversation.title,
        summary=conversation.summary,
        created_at=conversation.created_at,
        updated_at=conversation.updated_at,
        is_archived=conversation.is_archived,
        message_count=0
    )

@router.get("/conversations/{conversation_id}", response_model=ConversationDetail)
def get_conversation(
    conversation_id: UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """获取对话详情（包含所有消息）"""
    conversation = session.get(Conversation, conversation_id)
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    
    project = session.get(Project, conversation.project_id)
    if not project or project.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    messages = session.exec(
        select(ConversationMessage)
        .where(ConversationMessage.conversation_id == conversation_id)
        .order_by(ConversationMessage.created_at)
    ).all()
    
    msg_list = []
    for msg in messages:
        msg_dict = {
            "id": str(msg.id),
            "conversation_id": str(msg.conversation_id),
            "role": msg.role,
            "content": msg.content,
            "created_at": msg.created_at.isoformat(),
            "response_mode": msg.response_mode,
            "response_data": json.loads(msg.response_data) if msg.response_data else None,
            "files": json.loads(msg.files) if msg.files else None
        }
        msg_list.append(msg_dict)
    
    return ConversationDetail(
        id=conversation.id,
        project_id=conversation.project_id,
        title=conversation.title,
        summary=conversation.summary,
        created_at=conversation.created_at,
        updated_at=conversation.updated_at,
        is_archived=conversation.is_archived,
        message_count=len(messages),
        messages=msg_list
    )

@router.put("/conversations/{conversation_id}", response_model=ConversationPublic)
def update_conversation(
    conversation_id: UUID,
    title: str = None,
    summary: str = None,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """更新对话信息"""
    conversation = session.get(Conversation, conversation_id)
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    
    project = session.get(Project, conversation.project_id)
    if not project or project.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    if title:
        conversation.title = title
    if summary is not None:
        conversation.summary = summary
    conversation.updated_at = datetime.utcnow()
    
    session.add(conversation)
    session.commit()
    session.refresh(conversation)
    
    msg_count = len(session.exec(
        select(ConversationMessage).where(ConversationMessage.conversation_id == conversation_id)
    ).all())
    
    return ConversationPublic(
        id=conversation.id,
        project_id=conversation.project_id,
        title=conversation.title,
        summary=conversation.summary,
        created_at=conversation.created_at,
        updated_at=conversation.updated_at,
        is_archived=conversation.is_archived,
        message_count=msg_count
    )

@router.delete("/conversations/{conversation_id}")
def delete_conversation(
    conversation_id: UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """删除对话（归档）"""
    conversation = session.get(Conversation, conversation_id)
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    
    project = session.get(Project, conversation.project_id)
    if not project or project.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    conversation.is_archived = True
    conversation.updated_at = datetime.utcnow()
    session.add(conversation)
    session.commit()
    
    return {"status": "archived"}

@router.post("/conversations/{conversation_id}/messages", response_model=MessagePublic)
def add_message(
    conversation_id: UUID,
    role: str,
    content: str,
    response_mode: str = None,
    response_data: dict = None,
    files: list = None,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """添加消息到对话"""
    conversation = session.get(Conversation, conversation_id)
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    
    project = session.get(Project, conversation.project_id)
    if not project or project.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    message = ConversationMessage(
        conversation_id=conversation_id,
        role=role,
        content=content,
        response_mode=response_mode,
        response_data=json.dumps(response_data) if response_data else None,
        files=json.dumps(files) if files else None
    )
    session.add(message)
    
    conversation.updated_at = datetime.utcnow()
    if role == "user" and conversation.title == "新对话":
        conversation.title = content[:30] + ("..." if len(content) > 30 else "")
    
    session.add(conversation)
    session.commit()
    session.refresh(message)
    
    return MessagePublic(
        id=message.id,
        conversation_id=message.conversation_id,
        role=message.role,
        content=message.content,
        created_at=message.created_at,
        response_mode=message.response_mode,
        response_data=json.loads(message.response_data) if message.response_data else None,
        files=json.loads(message.files) if message.files else None
    )

@router.get("/conversations/{conversation_id}/messages", response_model=List[MessagePublic])
def get_messages(
    conversation_id: UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """获取对话的所有消息"""
    conversation = session.get(Conversation, conversation_id)
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    
    project = session.get(Project, conversation.project_id)
    if not project or project.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    messages = session.exec(
        select(ConversationMessage)
        .where(ConversationMessage.conversation_id == conversation_id)
        .order_by(ConversationMessage.created_at)
    ).all()
    
    return [
        MessagePublic(
            id=msg.id,
            conversation_id=msg.conversation_id,
            role=msg.role,
            content=msg.content,
            created_at=msg.created_at,
            response_mode=msg.response_mode,
            response_data=json.loads(msg.response_data) if msg.response_data else None,
            files=json.loads(msg.files) if msg.files else None
        )
        for msg in messages
    ]
