from datetime import timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlmodel import Session, select
from jose import jwt
from pydantic import BaseModel

from app.core.db import get_session
from app.core.config import settings
from app.core.security import create_access_token, get_password_hash, verify_password
from app.models.user import User, UserCreate, UserPublic, Token

router = APIRouter()

# === 1. 注册接口 ===
@router.post("/register", response_model=UserPublic)
def register_user(user_in: UserCreate, session: Session = Depends(get_session)):
    # 检查邮箱是否已存在
    statement = select(User).where(User.email == user_in.email)
    existing_user = session.exec(statement).first()
    if existing_user:
        raise HTTPException(
            status_code=400,
            detail="The user with this email already exists in the system.",
        )
    
    # 创建新用户
    user = User.model_validate(
        user_in, 
        update={"hashed_password": get_password_hash(user_in.password)}
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return user

# === 2. 登录接口 (修复了 Token 报错) ===
@router.post("/login", response_model=Token)
def login_access_token(
    form_data: OAuth2PasswordRequestForm = Depends(),
    session: Session = Depends(get_session),
) -> Any:
    """
    OAuth2 compatible token login, get an access token for future requests
    """
    # 1. 查找用户
    statement = select(User).where(User.email == form_data.username)
    user = session.exec(statement).first()

    # 2. 验证密码
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Incorrect email or password")
    
    if not user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")

    # 3. 生成 Token
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        subject=user.email, expires_delta=access_token_expires
    )
    
    # 🔧 关键修复：显式传入 token_type="bearer"
    return Token(access_token=access_token, token_type="bearer")

# === 3. 找回密码相关模型 ===
class EmailSchema(BaseModel):
    email: str

class ResetPasswordSchema(BaseModel):
    token: str
    new_password: str

# === 4. 请求重置密码 (模拟发邮件) ===
@router.post("/password-recovery/{email}")
def recover_password(email: str):
    """
    生成重置 Token 并打印在控制台 (模拟发送邮件)
    """
    reset_token = create_access_token(subject=email, expires_delta=timedelta(minutes=15))
    
    reset_link = f"{settings.FRONTEND_URL}/reset-password?token={reset_token}"
    
    print("\n" + "="*60)
    print(f"📧 [MOCK EMAIL] To: {email}")
    print(f"🔗 Click to reset: {reset_link}")
    print("="*60 + "\n")
    
    return {"msg": "Password recovery email sent"}

# === 5. 执行重置密码 ===
@router.post("/reset-password")
def reset_password(payload: ResetPasswordSchema, session: Session = Depends(get_session)):
    """
    验证 Token 并更新密码
    """
    try:
        payload_data = jwt.decode(payload.token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        email = payload_data.get("sub")
        if not email:
            raise HTTPException(status_code=400, detail="Invalid token")
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid or expired token")
        
    statement = select(User).where(User.email == email)
    user = session.exec(statement).first()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    user.hashed_password = get_password_hash(payload.new_password)
    session.add(user)
    session.commit()
    
    return {"msg": "Password updated successfully"}