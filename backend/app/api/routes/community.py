from fastapi import APIRouter, Depends, HTTPException
from typing import List, Dict, Any, Optional
from pydantic import BaseModel
from sqlmodel import Session, select
import json

from app.core.db import get_session
from app.api.deps import get_current_user
from app.models.user import User
from app.models.community import CommunityShare, CommunityComment, CommunityFavorite, ShareType, ShareStatus

router = APIRouter()

# === Schemas ===
class ShareCreate(BaseModel):
    share_type: str
    name: str
    description: str = ""
    category: str = ""
    tags: List[str] = []
    script_content: str = ""
    config_json: Dict[str, Any] = {}
    params_schema: Dict[str, Any] = {}

class ShareUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    tags: Optional[List[str]] = None
    script_content: Optional[str] = None
    config_json: Optional[Dict[str, Any]] = None
    params_schema: Optional[Dict[str, Any]] = None

class CommentCreate(BaseModel):
    content: str
    rating: int = 0

# === Share Endpoints ===
@router.get("/shares")
def list_shares(
    share_type: Optional[str] = None,
    category: Optional[str] = None,
    status: str = ShareStatus.PUBLISHED.value,
    limit: int = 20,
    offset: int = 0,
    session: Session = Depends(get_session)
) -> Dict[str, Any]:
    """List community shares"""
    query = select(CommunityShare).where(CommunityShare.status == status)
    
    if share_type:
        query = query.where(CommunityShare.share_type == share_type)
    if category:
        query = query.where(CommunityShare.category == category)
    
    query = query.order_by(CommunityShare.download_count.desc()).offset(offset).limit(limit)
    
    shares = session.exec(query).all()
    
    # Get total count
    count_query = select(CommunityShare).where(CommunityShare.status == status)
    if share_type:
        count_query = count_query.where(CommunityShare.share_type == share_type)
    total = len(session.exec(count_query).all())
    
    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "items": [
            {
                "id": s.id,
                "share_type": s.share_type,
                "name": s.name,
                "description": s.description,
                "category": s.category,
                "tags": json.loads(s.tags) if s.tags else [],
                "author_name": s.author_name,
                "download_count": s.download_count,
                "star_count": s.star_count,
                "created_at": s.created_at.isoformat()
            }
            for s in shares
        ]
    }

@router.get("/shares/featured")
def get_featured_shares(
    limit: int = 10,
    session: Session = Depends(get_session)
) -> List[Dict[str, Any]]:
    """Get featured shares"""
    shares = session.exec(
        select(CommunityShare)
        .where(CommunityShare.is_featured == True)
        .where(CommunityShare.status == ShareStatus.PUBLISHED.value)
        .order_by(CommunityShare.download_count.desc())
        .limit(limit)
    ).all()
    
    return [
        {
            "id": s.id,
            "share_type": s.share_type,
            "name": s.name,
            "description": s.description,
            "category": s.category,
            "author_name": s.author_name,
            "download_count": s.download_count,
            "star_count": s.star_count
        }
        for s in shares
    ]

@router.get("/shares/{share_id}")
def get_share(
    share_id: int,
    session: Session = Depends(get_session)
) -> Dict[str, Any]:
    """Get share details"""
    share = session.get(CommunityShare, share_id)
    if not share:
        raise HTTPException(status_code=404, detail="Share not found")
    
    return {
        "id": share.id,
        "share_type": share.share_type,
        "name": share.name,
        "description": share.description,
        "category": share.category,
        "tags": json.loads(share.tags) if share.tags else [],
        "script_content": share.script_content,
        "config_json": json.loads(share.config_json) if share.config_json else {},
        "params_schema": json.loads(share.params_schema) if share.params_schema else {},
        "author_id": share.author_id,
        "author_name": share.author_name,
        "download_count": share.download_count,
        "star_count": share.star_count,
        "usage_count": share.usage_count,
        "status": share.status,
        "created_at": share.created_at.isoformat(),
        "updated_at": share.updated_at.isoformat()
    }

@router.post("/shares")
def create_share(
    share: ShareCreate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
) -> Dict[str, Any]:
    """Create a new share"""
    new_share = CommunityShare(
        share_type=share.share_type,
        name=share.name,
        description=share.description,
        category=share.category,
        tags=json.dumps(share.tags),
        script_content=share.script_content,
        config_json=json.dumps(share.config_json),
        params_schema=json.dumps(share.params_schema),
        author_id=current_user.id,
        author_name=current_user.full_name or current_user.email.split('@')[0],
        status=ShareStatus.DRAFT.value
    )
    
    session.add(new_share)
    session.commit()
    session.refresh(new_share)
    
    return {
        "id": new_share.id,
        "status": new_share.status,
        "message": "Share created successfully"
    }

@router.put("/shares/{share_id}")
def update_share(
    share_id: int,
    update: ShareUpdate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
) -> Dict[str, Any]:
    """Update a share"""
    share = session.get(CommunityShare, share_id)
    if not share:
        raise HTTPException(status_code=404, detail="Share not found")
    if share.author_id != current_user.id:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    if update.name is not None:
        share.name = update.name
    if update.description is not None:
        share.description = update.description
    if update.category is not None:
        share.category = update.category
    if update.tags is not None:
        share.tags = json.dumps(update.tags)
    if update.script_content is not None:
        share.script_content = update.script_content
    if update.config_json is not None:
        share.config_json = json.dumps(update.config_json)
    if update.params_schema is not None:
        share.params_schema = json.dumps(update.params_schema)
    
    share.updated_at = datetime.utcnow()
    
    session.add(share)
    session.commit()
    
    return {"message": "Share updated successfully"}

@router.post("/shares/{share_id}/publish")
def publish_share(
    share_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
) -> Dict[str, Any]:
    """Publish a share"""
    share = session.get(CommunityShare, share_id)
    if not share:
        raise HTTPException(status_code=404, detail="Share not found")
    if share.author_id != current_user.id:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    share.status = ShareStatus.PUBLISHED.value
    share.updated_at = datetime.utcnow()
    
    session.add(share)
    session.commit()
    
    return {"message": "Share published successfully"}

@router.post("/shares/{share_id}/download")
def download_share(
    share_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
) -> Dict[str, Any]:
    """Download a share (increments counter)"""
    share = session.get(CommunityShare, share_id)
    if not share:
        raise HTTPException(status_code=404, detail="Share not found")
    
    share.download_count += 1
    session.add(share)
    session.commit()
    
    return {
        "script_content": share.script_content,
        "config": json.loads(share.config_json) if share.config_json else {},
        "params_schema": json.loads(share.params_schema) if share.params_schema else {}
    }

# === Comments ===
@router.get("/shares/{share_id}/comments")
def list_comments(
    share_id: int,
    session: Session = Depends(get_session)
) -> List[Dict[str, Any]]:
    """List comments for a share"""
    comments = session.exec(
        select(CommunityComment)
        .where(CommunityComment.share_id == share_id)
        .order_by(CommunityComment.created_at.desc())
    ).all()
    
    return [
        {
            "id": c.id,
            "user_name": c.user_name,
            "content": c.content,
            "rating": c.rating,
            "created_at": c.created_at.isoformat()
        }
        for c in comments
    ]

@router.post("/shares/{share_id}/comments")
def add_comment(
    share_id: int,
    comment: CommentCreate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
) -> Dict[str, Any]:
    """Add a comment"""
    share = session.get(CommunityShare, share_id)
    if not share:
        raise HTTPException(status_code=404, detail="Share not found")
    
    new_comment = CommunityComment(
        share_id=share_id,
        user_id=current_user.id,
        user_name=current_user.full_name or current_user.email.split('@')[0],
        content=comment.content,
        rating=comment.rating
    )
    
    session.add(new_comment)
    
    # Update star count if rating given
    if comment.rating > 0:
        avg_rating = session.exec(
            select(CommunityComment)
            .where(CommunityComment.share_id == share_id)
        ).all()
        total_stars = sum(c.rating for c in avg_rating if c.rating > 0)
        count = sum(1 for c in avg_rating if c.rating > 0)
        share.star_count = total_stars // count if count > 0 else 0
        session.add(share)
    
    session.commit()
    
    return {"message": "Comment added successfully"}

# === Favorites ===
@router.post("/shares/{share_id}/favorite")
def toggle_favorite(
    share_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
) -> Dict[str, Any]:
    """Toggle favorite"""
    share = session.get(CommunityShare, share_id)
    if not share:
        raise HTTPException(status_code=404, detail="Share not found")
    
    existing = session.exec(
        select(CommunityFavorite).where(
            CommunityFavorite.share_id == share_id,
            CommunityFavorite.user_id == current_user.id
        )
    ).first()
    
    if existing:
        session.delete(existing)
        session.commit()
        return {"favorited": False}
    else:
        favorite = CommunityFavorite(
            share_id=share_id,
            user_id=current_user.id
        )
        session.add(favorite)
        share.star_count += 1
        session.add(share)
        session.commit()
        return {"favorited": True}

@router.get("/users/favorites")
def list_favorites(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
) -> List[Dict[str, Any]]:
    """List user's favorites"""
    favorites = session.exec(
        select(CommunityFavorite)
        .where(CommunityFavorite.user_id == current_user.id)
        .order_by(CommunityFavorite.created_at.desc())
    ).all()
    
    result = []
    for fav in favorites:
        share = session.get(CommunityShare, fav.share_id)
        if share:
            result.append({
                "id": share.id,
                "share_type": share.share_type,
                "name": share.name,
                "description": share.description,
                "category": share.category,
                "author_name": share.author_name,
                "favorited_at": fav.created_at.isoformat()
            })
    
    return result

from datetime import datetime
