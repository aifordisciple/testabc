from typing import Dict, Any, List, Optional
from datetime import datetime
from enum import Enum
from sqlmodel import SQLModel, Field

class ShareType(str, Enum):
    WORKFLOW = "workflow"
    TOOL = "tool"
    PIPELINE = "pipeline"
    TEMPLATE = "template"

class ShareStatus(str, Enum):
    DRAFT = "draft"
    PUBLISHED = "published"
    REVIEWING = "reviewing"
    REJECTED = "rejected"
    DEPRECATED = "deprecated"

class CommunityShare(SQLModel, table=True):
    __tablename__ = "community_shares"
    
    id: Optional[int] = Field(default=None, primary_key=True)
    share_type: str = Field(index=True)
    name: str = Field(index=True)
    description: str = ""
    category: str = ""
    tags: str = ""  # JSON array stored as string
    
    # Content
    script_content: str = ""
    config_json: str = "{}"
    params_schema: str = "{}"
    
    # Metadata
    author_id: int = Field(index=True)
    author_name: str = ""
    
    # Statistics
    download_count: int = 0
    star_count: int = 0
    usage_count: int = 0
    
    # Status
    status: str = Field(default=ShareStatus.DRAFT.value, index=True)
    is_featured: bool = Field(default=False)
    
    # Timestamps
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class CommunityComment(SQLModel, table=True):
    __tablename__ = "community_comments"
    
    id: Optional[int] = Field(default=None, primary_key=True)
    share_id: int = Field(index=True)
    user_id: int = Field(index=True)
    user_name: str = ""
    
    content: str = ""
    rating: int = 0  # 1-5 stars
    
    created_at: datetime = Field(default_factory=datetime.utcnow)


class CommunityFavorite(SQLModel, table=True):
    __tablename__ = "community_favorites"
    
    id: Optional[int] = Field(default=None, primary_key=True)
    share_id: int = Field(index=True)
    user_id: int = Field(index=True)
    
    created_at: datetime = Field(default_factory=datetime.utcnow)
