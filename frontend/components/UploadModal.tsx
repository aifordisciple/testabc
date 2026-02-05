'use client';
import { useState } from 'react';

// 定义 Props 接口
interface UploadModalProps {
  projectId: string;
  currentFolderId?: string | null; // 👈 新增：支持上传到当前文件夹
  onClose: () => void;
  onUploadSuccess: () => void;
}

export default function UploadModal({ projectId, currentFolderId, onClose, onUploadSuccess }: UploadModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0); // 注意：fetch API 原生不支持上传进度，这里做模拟或暂时移除进度条准确度

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setProgress(10); // 假进度：开始

    try {
      const token = localStorage.getItem('token');
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;

      // 1. 构建 FormData (本地直存模式)
      const formData = new FormData();
      formData.append('file', file);
      // 注意：FastAPI 的 Form 字段名必须与后端 upload_file 参数名一致
      // 后端: project_id: uuid.UUID
      // 后端: parent_id: Optional[uuid.UUID] = Form(None)
      // 但根据我们之前的 files.py 定义，upload_file 是通过 Query Param 还是 Form 接收的？
      // 让我们回顾一下 files.py:
      // def upload_file(project_id: uuid.UUID, file: UploadFile, parent_id: Optional[uuid.UUID] = Form(None)...)
      // project_id 是 query param (FastAPI 默认)，file 和 parent_id 是 Form/File。
      
      // 所以 URL 应该是: /files/upload?project_id=xxx
      // Body 是 formData 包含 file 和 parent_id
      
      if (currentFolderId) {
        formData.append('parent_id', currentFolderId);
      }

      // 2. 发送请求
      // 注意：fetch 会自动设置 Content-Type 为 multipart/form-data，不要手动设置 headers['Content-Type']
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
        
        {/* 提示当前上传位置 */}
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
                style={{ width: `${progress === 0 ? 5 : progress}%` }}
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