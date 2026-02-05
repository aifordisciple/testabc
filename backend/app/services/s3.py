import boto3
from botocore.client import Config
from app.core.config import settings

class S3Service:
    def __init__(self):
        # 1. 内部客户端 (Internal Client)
        # 用于后端自己操作文件 (如列出桶内容)，连接 localhost 即可
        self.internal_client = boto3.client(
            's3',
            endpoint_url=settings.MINIO_ENDPOINT, # http://localhost:9000
            aws_access_key_id=settings.MINIO_ROOT_USER,
            aws_secret_access_key=settings.MINIO_ROOT_PASSWORD,
            config=Config(signature_version='s3v4'),
            region_name='us-east-1'
        )

        # 2. 公网客户端 (Public Client)
        # 专门用于生成 Presigned URL，必须配置浏览器实际访问的公网地址
        # 注意：这里 endpoint_url 必须填浏览器能访问到的那个地址
        self.public_endpoint = "http://113.44.66.210:9000"  
        self.public_client = boto3.client(
            's3',
            endpoint_url=self.public_endpoint,
            aws_access_key_id=settings.MINIO_ROOT_USER,
            aws_secret_access_key=settings.MINIO_ROOT_PASSWORD,
            config=Config(signature_version='s3v4'),
            region_name='us-east-1'
        )
        
        self.bucket = settings.MINIO_BUCKET_NAME

    def generate_presigned_url(self, object_name: str, content_type: str) -> str:
        """生成上传用的临时 URL"""
        try:
            # 使用 public_client 生成签名
            # 这样生成的签名就是基于 http://113.44.66.210:9000 计算的，完全合法
            url = self.public_client.generate_presigned_url(
                'put_object',
                Params={
                    'Bucket': self.bucket,
                    'Key': object_name,
                    'ContentType': content_type
                },
                ExpiresIn=3600
            )
            
            print(f"DEBUG: 生成的合法签名 URL: {url}")
            return url
        except Exception as e:
            print(f"S3 Error: {e}")
            return None

s3_service = S3Service()