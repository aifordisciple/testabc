'use client';
import { useState } from 'react';
import { toast } from '@/components/ui/Toast';

interface UploadModalProps {
  projectId: string;
  currentFolderId?: string | null;
  onClose: () => void;
  onUploadSuccess: () => void;
}

export default function UploadModal({ projectId, currentFolderId, onClose, onUploadSuccess }: UploadModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  // 设定切片大小：5MB
  const CHUNK_SIZE = 5 * 1024 * 1024; 

  const handleUpload = async () => {
    if (!file) return;
    
    setUploading(true);
    setProgress(0);
    const loadingToast = toast.loading("Preparing upload...");

    try {
      const token = localStorage.getItem('token');
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      
      // 👇 核心修复：兼容非 HTTPS (局域网 IP) 环境的 UUID 生成器
      const generateUploadId = () => {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) {
            return crypto.randomUUID();
        }
        // 降级方案：使用 Math.random 生成 UUID
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
      };

      // 使用兼容函数生成 UUID
      const uploadId = generateUploadId(); 
      const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

      toast.loading(`Uploading chunks (0/${totalChunks})...`, { id: loadingToast });

      // 顺序上传每个分片
      for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
        const start = chunkIndex * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, file.size);
        const chunk = file.slice(start, end);

        const formData = new FormData();
        formData.append('file', chunk);
        formData.append('filename', file.name);
        formData.append('chunk_index', chunkIndex.toString());
        formData.append('total_chunks', totalChunks.toString());
        formData.append('upload_id', uploadId);
        
        if (currentFolderId) {
          formData.append('parent_id', currentFolderId);
        }

        // 访问后端的切片上传接口
        const res = await fetch(`${apiUrl}/files/projects/${projectId}/files/chunk`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
          body: formData,
        });

        if (!res.ok) {
          const errorData = await res.json();
          throw new Error(errorData.detail || `Upload failed at chunk ${chunkIndex + 1}`);
        }

        // 更新真实进度
        const currentProgress = Math.round(((chunkIndex + 1) / totalChunks) * 100);
        setProgress(currentProgress);
        
        // 只有最后一个分片时才显示合并状态
        if (chunkIndex === totalChunks - 1) {
            toast.loading("Merging file on server...", { id: loadingToast });
        } else {
            toast.loading(`Uploading chunk ${chunkIndex + 1}/${totalChunks}...`, { id: loadingToast });
        }
      }

      setUploading(false);
      onUploadSuccess();
      toast.success('File uploaded successfully!', { id: loadingToast });
      onClose();

    } catch (e: any) {
      console.error(e);
      toast.error(`Upload Error: ${e.message}`, { id: loadingToast });
      setUploading(false);
      setProgress(0);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100]">
      <div className="bg-gray-900 p-6 rounded-xl border border-gray-700 w-96 shadow-2xl">
        <h3 className="text-xl font-bold text-white mb-4">Upload File (Chunked)</h3>
        
        <div className="mb-4 text-xs text-gray-500">
            Location: {currentFolderId ? 'Inside Folder' : 'Root Directory'}
        </div>

        <input 
          type="file" 
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-emerald-900 file:text-emerald-300 hover:file:bg-emerald-800 transition-colors"
        />

        {uploading && (
          <div className="mt-4">
            <div className="w-full bg-gray-700 rounded-full h-2.5 overflow-hidden">
                <div 
                    className="bg-emerald-500 h-2.5 rounded-full transition-all duration-300 ease-out" 
                    style={{ width: `${progress}%` }}
                ></div>
            </div>
            <div className="text-right text-xs text-gray-400 mt-1">
                {progress}%
            </div>
          </div>
        )}

        <div className="flex justify-end gap-3 mt-6">
          <button 
            onClick={onClose} 
            className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
            disabled={uploading}
          >
            Cancel
          </button>
          <button 
            onClick={handleUpload} 
            disabled={!file || uploading}
            className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors relative overflow-hidden"
          >
            {uploading ? (
              <span className="flex items-center gap-2">
                 <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                 Uploading...
              </span>
            ) : 'Upload'}
          </button>
        </div>
      </div>
    </div>
  );
}