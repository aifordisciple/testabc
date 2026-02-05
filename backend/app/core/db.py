from sqlmodel import SQLModel, create_engine, Session
from app.core.config import settings

# ⚠️ 必须导入定义了模型的模块，否则 SQLModel.metadata.create_all 不会创建表
# 也不要导入已删除的 bio 模块
from app.models import user 

# 创建数据库引擎
engine = create_engine(settings.SQLALCHEMY_DATABASE_URI, echo=True)

def init_db():
    """
    初始化数据库：创建所有定义在 SQLModel 子类中的表。
    """
    SQLModel.metadata.create_all(engine)

def get_session():
    """
    Dependency (依赖注入) 函数
    """
    with Session(engine) as session:
        yield session