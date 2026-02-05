'use client';
import { useState } from 'react';

interface FileUploaderProps {
  projectId: string;
}

export default function FileUploader({ projectId }: FileUploaderProps) {
  const [uploading, setUploading] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);

    try {
      const token = localStorage.getItem('token');
      
      // === 核心修改：改为 FormData 直接上传 ===
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch(`/api/files/upload?project_id=${projectId}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData,
      });

      if (!res.ok) {
        throw new Error('Upload failed');
      }

      alert('上传成功！');
    } catch (error) {
      console.error(error);
      alert('上传失败');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="p-4 border border-dashed rounded-lg border-gray-700 bg-gray-800">
      <input 
        type="file" 
        onChange={handleFileChange} 
        disabled={uploading}
        className="text-gray-300" 
      />
      {uploading && <p className="text-emerald-400 text-sm mt-2">正在上传中...</p>}
    </div>
  );
}