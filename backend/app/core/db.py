from sqlmodel import SQLModel, create_engine, Session
from app.core.config import settings

# 创建数据库引擎
# echo=True 会在控制台打印 SQL 语句，方便调试
engine = create_engine(settings.SQLALCHEMY_DATABASE_URI, echo=True)

def init_db():
    """
    初始化数据库：创建所有定义在 SQLModel 子类中的表。
    """
    SQLModel.metadata.create_all(engine)

def get_session():
    """
    Dependency (依赖注入) 函数
    为每个请求创建一个独立的数据库会话，请求结束后自动关闭。
    """
    with Session(engine) as session:
        yield session
