from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    """
    系统配置类
    """
    # === 基础配置 ===
    API_V1_STR: str = "/api/v1"
    PROJECT_NAME: str = "Autonome Backend"
    
    # === 数据库配置 (变量名必须与 .env 完全一致) ===
    DB_HOST: str = "localhost"
    DB_USER: str = "autonome"
    DB_PASSWORD: str = "Ehuoyi917"
    DB_NAME: str = "autonome_core"
    DB_PORT: int = 5433  # 默认值改为你的自定义端口
    
    # === 安全配置 ===
    SECRET_KEY: str = "dev_secret_key_change_this_in_production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7
    
    # === MinIO 配置 (变量名必须与 .env 完全一致) ===
    MINIO_ENDPOINT: str = "http://localhost:9000"
    MINIO_ROOT_USER: str = "admin"
    MINIO_ROOT_PASSWORD: str = "Ehuoyi917"
    MINIO_CONSOLE_PORT: int = 9001
    MINIO_BUCKET_NAME: str = "bio-data"

    @property
    def SQLALCHEMY_DATABASE_URI(self) -> str:
        """根据参数生成数据库连接字符串"""
        return f"postgresql://{self.DB_USER}:{self.DB_PASSWORD}@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}"

    # === Pydantic 配置 ===
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore"  # 忽略 .env 中多余的变量 (如 REDIS_HOST 等暂未在类中定义的)
    )

# 实例化配置对象
settings = Settings()