'use client';
import { useState } from 'react';

interface CreateProjectModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export default function CreateProjectModal({ onClose, onSuccess }: CreateProjectModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    
    setLoading(true);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      const token = localStorage.getItem('token');

      const res = await fetch(`${apiUrl}/files/projects`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ name, description }),
      });

      if (res.ok) {
        // 创建成功
        onSuccess(); 
        onClose();
      } else {
        const err = await res.json();
        alert(`创建失败: ${err.detail || '未知错误'}`);
      }
    } catch (error) {
      alert('网络连接失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
      <div className="bg-gray-900 p-6 rounded-xl border border-gray-700 w-96 shadow-2xl">
        <h3 className="text-xl font-bold text-white mb-4">Create New Project</h3>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Project Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              required
              className="block w-full rounded-md bg-gray-800 border-0 py-2 px-3 text-white ring-1 ring-inset ring-gray-700 focus:ring-2 focus:ring-blue-500 sm:text-sm"
              placeholder="e.g. Lung Cancer RNA-seq"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Description
            </label>
            <textarea
              className="block w-full rounded-md bg-gray-800 border-0 py-2 px-3 text-white ring-1 ring-inset ring-gray-700 focus:ring-2 focus:ring-blue-500 sm:text-sm h-24 resize-none"
              placeholder="Brief description of your research goal..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-3 mt-6">
            <button 
              type="button"
              onClick={onClose} 
              className="text-gray-400 hover:text-white transition-colors px-3 py-2 text-sm"
            >
              Cancel
            </button>
            <button 
              type="submit" 
              disabled={loading || !name.trim()}
              className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg disabled:opacity-50 transition-colors font-medium text-sm flex items-center"
            >
              {loading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Creating...
                </>
              ) : 'Create Project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}