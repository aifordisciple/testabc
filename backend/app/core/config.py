from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional

class Settings(BaseSettings):
    """
    系统配置类
    """
    # === 基础配置 ===
    API_V1_STR: str = "/api/v1"
    PROJECT_NAME: str = "Autonome Backend"
    
    # === 数据库配置 ===
    DB_HOST: str = "db"
    DB_USER: str = "autonome"
    DB_PASSWORD: str = "Ehuoyi9171"
    DB_NAME: str = "autonome_core"
    DB_PORT: int = 5432 
    
    # === 安全配置 ===
    SECRET_KEY: str = "dev_secret_key_change_this_in_production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7
    
    # === MinIO 配置 ===
    MINIO_ENDPOINT: str = "http://minio:9000"
    MINIO_ROOT_USER: str = "admin"
    MINIO_ROOT_PASSWORD: str = "Ehuoyi9171"
    MINIO_CONSOLE_PORT: int = 9001
    MINIO_BUCKET_NAME: str = "autonome"

    # === Redis & Celery 配置 ===
    REDIS_HOST: str = "redis"
    REDIS_PORT: int = 6379
    
    # === LLM Configuration (新增) ===
    # 默认值适配 Docker 环境下的 Ollama
    # 如果 .env 文件中有定义，这里的值会被覆盖
    LLM_PROVIDER: str = "ollama"
    LLM_BASE_URL: str = "http://host.docker.internal:11434/v1"
    LLM_MODEL: str = "deepseek-r1:30b"
    LLM_API_KEY: str = "ollama"

    @property
    def CELERY_BROKER_URL(self) -> str:
        """生成 Celery Broker URL"""
        return f"redis://{self.REDIS_HOST}:{self.REDIS_PORT}/0"

    @property
    def CELERY_RESULT_BACKEND(self) -> str:
        """生成 Celery Result Backend URL"""
        return f"redis://{self.REDIS_HOST}:{self.REDIS_PORT}/0"

    @property
    def SQLALCHEMY_DATABASE_URI(self) -> str:
        """根据参数生成数据库连接字符串"""
        return f"postgresql://{self.DB_USER}:{self.DB_PASSWORD}@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}"

    # === Pydantic 配置 ===
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore"
    )

# 实例化配置对象
settings = Settings()