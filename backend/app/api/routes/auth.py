from datetime import timedelta
from typing import Annotated
from jose import jwt
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlmodel import Session, select

from app.core.db import get_session
from app.core.security import create_access_token, get_password_hash, verify_password
from app.core.config import settings
from app.models.user import User, UserCreate, UserPublic, Token

from pydantic import BaseModel

router = APIRouter()

@router.post("/register", response_model=UserPublic)
def register_user(user_in: UserCreate, session: Session = Depends(get_session)):
    """
    用户注册接口
    1. 检查邮箱是否已存在
    2. 哈希密码
    3. 保存到数据库
    """
    # 检查邮箱
    statement = select(User).where(User.email == user_in.email)
    existing_user = session.exec(statement).first()
    if existing_user:
        raise HTTPException(
            status_code=400,
            detail="该邮箱已被注册"
        )
    
    # 创建用户对象
    user = User.model_validate(user_in, update={"hashed_password": get_password_hash(user_in.password)})
    session.add(user)
    session.commit()
    session.refresh(user)
    return user

@router.post("/login", response_model=Token)
def login_access_token(
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
    session: Session = Depends(get_session)
):
    """
    OAuth2 兼容的登录接口 (Swagger UI 默认使用此格式)
    username 字段接收 email
    """
    # 查找用户
    statement = select(User).where(User.email == form_data.username)
    user = session.exec(statement).first()
    
    # 验证
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="邮箱或密码错误",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # 签发 Token
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        subject=user.email, expires_delta=access_token_expires
    )
    return Token(access_token=access_token)

# === 新增 Pydantic 模型 (为了接收 JSON) ===
class EmailSchema(BaseModel):
    email: str

class ResetPasswordSchema(BaseModel):
    token: str
    new_password: str

# === 1. 请求重置密码 (模拟发邮件) ===
@router.post("/password-recovery/{email}")
def recover_password(email: str):
    """
    生成重置 Token 并打印在控制台 (模拟发送邮件)
    """
    # 真实场景：这里应该查询数据库确认 email 存在
    # session = next(get_session())
    # user = session.exec(select(User).where(User.email == email)).first()
    # if not user: ...
    
    # 生成一个短有效期的 Token (比如 15分钟)
    # 我们复用 create_access_token，实际可以用专门的 type='reset'
    reset_token = create_access_token(subject=email, expires_delta=timedelta(minutes=15))
    
    # === 模拟发送邮件 ===
    reset_link = f"http://localhost:3001/reset-password?token={reset_token}"
    
    print("\n" + "="*60)
    print(f"📧 [MOCK EMAIL] To: {email}")
    print(f"🔗 Click to reset: {reset_link}")
    print("="*60 + "\n")
    
    return {"msg": "Password recovery email sent"}

# === 2. 执行重置密码 ===
@router.post("/reset-password")
def reset_password(payload: ResetPasswordSchema, session: Session = Depends(get_session)):
    """
    验证 Token 并更新密码
    """
    try:
        # 解码 Token
        payload_data = jwt.decode(payload.token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        email = payload_data.get("sub")
        if not email:
            raise HTTPException(status_code=400, detail="Invalid token")
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid or expired token")
        
    # 查找用户
    statement = select(User).where(User.email == email)
    user = session.exec(statement).first()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    # 更新密码
    user.hashed_password = get_password_hash(payload.new_password)
    session.add(user)
    session.commit()
    
    return {"msg": "Password updated successfully"}