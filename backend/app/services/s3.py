import boto3
from botocore.client import Config
from app.core.config import settings


class S3Service:
    def __init__(self):
        # 1. 内部客户端 (Internal Client)
        # 用于后端自己操作文件 (如列出桶内容)，连接 localhost 即可
        self.internal_client = boto3.client(
            's3',
            endpoint_url=settings.MINIO_ENDPOINT,  # http://minio:9000
            aws_access_key_id=settings.MINIO_ROOT_USER,
            aws_secret_access_key=settings.MINIO_ROOT_PASSWORD,
            config=Config(signature_version='s3v4'),
            region_name='us-east-1'
        )

        # 2. 公网客户端 (Public Client)
        # 专门用于生成 Presigned URL，必须配置浏览器实际访问的公网地址
        # 如果未配置 MINIO_PUBLIC_ENDPOINT，则回退到 MINIO_ENDPOINT
        public_endpoint = settings.MINIO_PUBLIC_ENDPOINT or settings.MINIO_ENDPOINT
        self.public_endpoint = public_endpoint
        self.public_client = boto3.client(
            's3',
            endpoint_url=self.public_endpoint,
            aws_access_key_id=settings.MINIO_ROOT_USER,
            aws_secret_access_key=settings.MINIO_ROOT_PASSWORD,
            config=Config(signature_version='s3v4'),
            region_name='us-east-1'
        )
        
        self.bucket = settings.MINIO_BUCKET_NAME

    # 修改 generate_presigned_url 方法签名和内部逻辑
    def generate_presigned_url(self, object_name: str, content_type: str, method: str = 'put_object') -> str:
        try:
            params = {
                'Bucket': self.bucket,
                'Key': object_name,
            }
            if method == 'put_object':
                params['ContentType'] = content_type
            
            url = self.public_client.generate_presigned_url(
                ClientMethod=method,  # 使用传入的方法
                Params=params,
                ExpiresIn=3600
            )
            
            return url
        except Exception as e:
            # 使用 proper logging 替代 print
            import logging
            logging.error(f"S3 generate_presigned_url error: {e}")
            return None

    # 在 S3Service 类中增加
    def delete_file(self, s3_key: str):
        try:
            self.internal_client.delete_object(Bucket=self.bucket, Key=s3_key)
            return True
        except Exception as e:
            import logging
            logging.error(f"S3 delete_file error: {e}")
            return False


s3_service = S3Service()
