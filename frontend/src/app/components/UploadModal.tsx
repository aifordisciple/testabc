'use client';
import { useState } from 'react';

export default function UploadModal({ projectId, onClose, onUploadSuccess }: any) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    
    try {
      const token = localStorage.getItem('token');
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;

      // 1. 获取 Presigned URL
      const res1 = await fetch(`${apiUrl}/files/upload/presigned?filename=${file.name}&content_type=${file.type}&project_id=${projectId}`, {
        method: 'POST',
      });
      const { upload_url, s3_key } = await res1.json();

      // 2. 直传 MinIO (PUT)
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', upload_url, true);
      xhr.setRequestHeader('Content-Type', file.type);
      
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const percentComplete = (e.loaded / e.total) * 100;
          setProgress(percentComplete);
        }
      };

      xhr.onload = async () => {
        if (xhr.status === 200) {
          // 3. 通知后端确认
          await fetch(`${apiUrl}/files/upload/confirm`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              filename: file.name,
              size: file.size,
              content_type: file.type,
              s3_key: s3_key,
              project_id: projectId
            })
          });
          setUploading(false);
          onUploadSuccess();
          alert('上传成功！');
          onClose();
        } else {
          alert('上传 MinIO 失败');
          setUploading(false);
        }
      };

      xhr.send(file);

    } catch (e) {
      console.error(e);
      alert('上传流程出错');
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
      <div className="bg-gray-900 p-6 rounded-xl border border-gray-700 w-96 shadow-2xl">
        <h3 className="text-xl font-bold text-white mb-4">Upload Data</h3>
        
        <input 
          type="file" 
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-900 file:text-blue-300 hover:file:bg-blue-800 cursor-pointer"
        />

        {uploading && (
          <div className="w-full bg-gray-700 rounded-full h-2.5 mt-4">
            <div className="bg-blue-600 h-2.5 rounded-full transition-all duration-300" style={{ width: `${progress}%` }}></div>
          </div>
        )}

        <div className="flex justify-end gap-3 mt-6">
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">Cancel</button>
          <button 
            onClick={handleUpload} 
            disabled={!file || uploading}
            className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg disabled:opacity-50 transition-colors font-medium"
          >
            {uploading ? 'Uploading...' : 'Start Upload'}
          </button>
        </div>
      </div>
    </div>
  );
}