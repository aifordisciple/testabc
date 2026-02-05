'use client';
import { useState } from 'react';

// ✅ 关键修复：确保接口定义包含 currentFolderId
interface UploadModalProps {
  projectId: string;
  currentFolderId?: string | null; // 👈 必须加上这行
  onClose: () => void;
  onUploadSuccess: () => void;
}

export default function UploadModal({ projectId, currentFolderId, onClose, onUploadSuccess }: UploadModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setProgress(10);

    try {
      const token = localStorage.getItem('token');
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;

      const formData = new FormData();
      formData.append('file', file);
      
      // 如果当前在某个文件夹内，带上 parent_id
      if (currentFolderId) {
        formData.append('parent_id', currentFolderId);
      }

      // 这里的 API 路径必须与后端 routes/files.py 定义一致
      // 后端定义: @router.post("/upload") ... upload_file(project_id: uuid.UUID ...)
      // 所以是 POST /api/v1/files/upload?project_id=...
      const res = await fetch(`${apiUrl}/files/upload?project_id=${projectId}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData,
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.detail || 'Upload failed');
      }
      
      setProgress(100);
      setUploading(false);
      onUploadSuccess();
      alert('上传成功！');
      onClose();

    } catch (e: any) {
      console.error(e);
      alert(`上传失败: ${e.message}`);
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
      <div className="bg-gray-900 p-6 rounded-xl border border-gray-700 w-96 shadow-2xl">
        <h3 className="text-xl font-bold text-white mb-4">Upload File</h3>
        
        <div className="mb-4 text-xs text-gray-500">
            Location: {currentFolderId ? 'Inside Folder' : 'Root Directory'}
        </div>

        <input 
          type="file" 
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-emerald-900 file:text-emerald-300 hover:file:bg-emerald-800 transition-colors"
        />

        {uploading && (
          <div className="w-full bg-gray-700 rounded-full h-2.5 mt-4 overflow-hidden">
            <div 
                className="bg-emerald-500 h-2.5 rounded-full animate-pulse" 
                style={{ width: `${progress}%` }}
            ></div>
          </div>
        )}

        <div className="flex justify-end gap-3 mt-6">
          <button 
            onClick={onClose} 
            className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button 
            onClick={handleUpload} 
            disabled={!file || uploading}
            className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors"
          >
            {uploading ? 'Uploading...' : 'Upload'}
          </button>
        </div>
      </div>
    </div>
  );
}