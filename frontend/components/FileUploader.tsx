'use client';
import { useState } from 'react';

// 1. 定义 Props 接口
interface FileUploaderProps {
  projectId: string;
}

// 2. 在函数参数中使用该接口
export default function FileUploader({ projectId }: FileUploaderProps) {
  const [uploading, setUploading] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);

    try {
      // 1. 向后端请求预签名 URL
      const res = await fetch('/api/upload/presigned', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            filename: file.name, 
            project_id: projectId,
            content_type: file.type 
        }),
      });
      const { upload_url, s3_key } = await res.json();

      // 2. 直接向 MinIO 上传文件 (PUT)
      await fetch(upload_url, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type }
      });

      // 3. 通知后端上传完成，写入数据库
      await fetch('/api/upload/confirm', {
        method: 'POST',
        body: JSON.stringify({
            filename: file.name,
            s3_key: s3_key,
            size: file.size,
            project_id: projectId
        })
      });

      alert('上传成功！');
    } catch (error) {
      console.error(error);
      alert('上传失败');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="p-4 border border-dashed rounded-lg">
      <input type="file" onChange={handleFileChange} disabled={uploading} />
      {uploading && <p>正在极速上传中...</p>}
    </div>
  );
}