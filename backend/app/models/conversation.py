from sqlmodel import SQLModel, Field, Relationship
from typing import Optional, List
from datetime import datetime
import uuid
import json

class ConversationBase(SQLModel):
    title: str = Field(default="新对话", description="对话标题")
    summary: Optional[str] = Field(default=None, description="对话摘要")

class Conversation(ConversationBase, table=True):
    """对话会话"""
    __tablename__ = "conversation"
    
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    project_id: uuid.UUID = Field(foreign_key="project.id", index=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    is_archived: bool = Field(default=False)

class ConversationMessageBase(SQLModel):
    role: str = Field(..., description="消息角色: user 或 assistant")
    content: str = Field(..., description="消息内容")

class ConversationMessage(ConversationMessageBase, table=True):
    """对话消息"""
    __tablename__ = "conversation_message"
    
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    conversation_id: uuid.UUID = Field(foreign_key="conversation.id", index=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    response_mode: Optional[str] = Field(default=None, description="响应模式")
    response_data: Optional[str] = Field(default=None, description="响应数据 (JSON)")
    files: Optional[str] = Field(default=None, description="附件数据 (JSON)")

class ConversationCreate(ConversationBase):
    project_id: uuid.UUID

class ConversationPublic(ConversationBase):
    id: uuid.UUID
    project_id: uuid.UUID
    created_at: datetime
    updated_at: datetime
    is_archived: bool
    message_count: int = 0

class ConversationDetail(ConversationPublic):
    messages: List[dict]

class MessageCreate(SQLModel):
    content: str

class MessagePublic(SQLModel):
    id: uuid.UUID
    conversation_id: uuid.UUID
    role: str
    content: str
    created_at: datetime
    response_mode: Optional[str] = None
    response_data: Optional[dict] = None
    plan_data: Optional[dict] = None  # Alias for response_data for frontend compatibility
    files: Optional[list] = None
    attachments: Optional[list] = None  # Alias for files for frontend compatibility
