from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from typing import List, Optional
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
        response_data = json.loads(msg.response_data) if msg.response_data else None
        files_data = json.loads(msg.files) if msg.files else None
        msg_dict = {
            "id": str(msg.id),
            "conversation_id": str(msg.conversation_id),
            "role": msg.role,
            "content": msg.content,
            "created_at": msg.created_at.isoformat(),
            "response_mode": msg.response_mode,
            "response_data": response_data,
            "plan_data": response_data,  # Alias for frontend compatibility
            "files": files_data,
            "attachments": files_data  # Alias for frontend compatibility
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
    title: Optional[str] = None,
    summary: Optional[str] = None,
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
    response_mode: Optional[str] = None,
    response_data: Optional[dict] = None,
    files: Optional[list] = None,
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
        plan_data=json.loads(message.response_data) if message.response_data else None,
        files=json.loads(message.files) if message.files else None,
        attachments=json.loads(message.files) if message.files else None
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
            plan_data=json.loads(msg.response_data) if msg.response_data else None,
            files=json.loads(msg.files) if msg.files else None,
            attachments=json.loads(msg.files) if msg.files else None
        )
        for msg in messages
    ]

# Search endpoint
@router.get("/projects/{project_id}/conversations/search")
def search_conversations(
    project_id: UUID,
    q: str,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """搜索对话消息"""
    project = session.get(Project, project_id)
    if not project or project.owner_id != current_user.id:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Search in conversation titles
    conv_query = select(Conversation).where(
        Conversation.project_id == project_id,
        Conversation.title.ilike(f"%{q}%")
    )
    conversations = session.exec(conv_query).all()
    
    # Search in messages
    msg_query = select(ConversationMessage).where(
        ConversationMessage.content.ilike(f"%{q}%")
    )
    all_messages = session.exec(msg_query).all()
    
    # Filter messages by project conversations
    conv_ids = {c.id for c in conversations}
    filtered_messages = [m for m in all_messages if m.conversation_id in conv_ids]
    
    return {
        "conversations": [
            {"id": str(c.id), "title": c.title, "updated_at": c.updated_at.isoformat()}
            for c in conversations
        ],
        "messages": [
            {
                "id": str(m.id),
                "conversation_id": str(m.conversation_id),
                "role": m.role,
                "content": m.content[:200] + ("..." if len(m.content) > 200 else ""),
                "created_at": m.created_at.isoformat()
            }
            for m in filtered_messages[:20]
        ]
    }


# Update message
@router.put("/messages/{message_id}")
def update_message(
    message_id: UUID,
    content: str,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """更新消息内容"""
    message = session.get(ConversationMessage, message_id)
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")
    
    conversation = session.get(Conversation, message.conversation_id)
    project = session.get(Project, conversation.project_id)
    if not project or project.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    message.content = content
    session.add(message)
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
        plan_data=json.loads(message.response_data) if message.response_data else None,
        files=json.loads(message.files) if message.files else None,
        attachments=json.loads(message.files) if message.files else None
    )

# Delete message
@router.delete("/messages/{message_id}")
def delete_message(
    message_id: UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """删除消息"""
    message = session.get(ConversationMessage, message_id)
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")
    
    conversation = session.get(Conversation, message.conversation_id)
    project = session.get(Project, conversation.project_id)
    if not project or project.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    session.delete(message)
    session.commit()
    
    return {"status": "deleted"}

# Export conversation
@router.get("/conversations/{conversation_id}/export")
def export_conversation(
    conversation_id: UUID,
    format: str = "markdown",
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """导出会话"""
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
    
    if format == "markdown":
        md = f"# {conversation.title}\n\n"
        md += f"*Created: {conversation.created_at} | Updated: {conversation.updated_at}*\n\n---\n\n"
        for msg in messages:
            role_emoji = "👤" if msg.role == "user" else "🤖"
            md += f"### {role_emoji} {msg.role.capitalize()}\n\n"
            md += msg.content + "\n\n"
        
        return {
            "format": "markdown",
            "content": md,
            "filename": f"{conversation.title[:30]}.md"
        }
    
    return {
        "format": "markdown",
        "content": "Export format not supported yet",
        "filename": f"{conversation.title[:30]}.md"
    }
