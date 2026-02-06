'use client';

import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';

interface WorkflowTemplate {
  id?: string;
  name: string;
  description?: string;
  category: string;
  subcategory?: string;
  script_path: string;
  default_container?: string;
  params_schema: string;
  is_public: boolean;
}

interface WorkflowEditorModalProps {
  initialData?: WorkflowTemplate;
  onClose: () => void;
  onSave: () => void;
}

export default function WorkflowEditorModal({ initialData, onClose, onSave }: WorkflowEditorModalProps) {
  const [formData, setFormData] = useState<WorkflowTemplate>({
    name: '',
    description: '',
    category: 'Analysis',
    subcategory: '',
    script_path: '',
    default_container: '',
    params_schema: '{\n  "type": "object",\n  "properties": {}\n}',
    is_public: true,
  });

  const [jsonError, setJsonError] = useState<string | null>(null);

  useEffect(() => {
    if (initialData) {
      setFormData(initialData);
    }
  }, [initialData]);

  const handleChange = (field: keyof WorkflowTemplate, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    
    // 实时校验 JSON
    if (field === 'params_schema') {
      try {
        JSON.parse(value as string);
        setJsonError(null);
      } catch (e) {
        setJsonError("Invalid JSON format");
      }
    }
  };

  const handleSubmit = async () => {
    if (!formData.name || !formData.script_path) {
      toast.error("Name and Script Path are required");
      return;
    }
    if (jsonError) {
      toast.error("Please fix JSON errors in parameters");
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
      
      const method = initialData?.id ? 'PATCH' : 'POST';
      const url = initialData?.id 
        ? `${apiUrl}/admin/workflows/${initialData.id}` 
        : `${apiUrl}/admin/workflows`;

      const res = await fetch(url, {
        method,
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(formData)
      });

      if (res.ok) {
        toast.success(initialData ? "Workflow updated" : "Workflow created");
        onSave();
        onClose();
      } else {
        const err = await res.json();
        toast.error(`Error: ${err.detail}`);
      }
    } catch (e) {
      toast.error("Network error");
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh]">
        <div className="p-6 border-b border-gray-800">
          <h3 className="text-xl font-bold text-white">
            {initialData ? 'Edit Workflow' : 'Create New Workflow'}
          </h3>
        </div>
        
        <div className="p-6 overflow-y-auto space-y-4">
          {/* 基本信息 */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Name *</label>
              <input 
                className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white text-sm"
                value={formData.name}
                onChange={e => handleChange('name', e.target.value)}
                placeholder="e.g. RNA-Seq QC"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Script Path (Folder Name) *</label>
              <input 
                className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white text-sm font-mono"
                value={formData.script_path}
                onChange={e => handleChange('script_path', e.target.value)}
                placeholder="e.g. rnaseq_qc"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">Description</label>
            <textarea 
              className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white text-sm h-20"
              value={formData.description || ''}
              onChange={e => handleChange('description', e.target.value)}
            />
          </div>

          {/* 分类 */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Category</label>
              <select 
                className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white text-sm"
                value={formData.category}
                onChange={e => handleChange('category', e.target.value)}
              >
                <option value="Analysis">Analysis</option>
                <option value="Utility">Utility</option>
                <option value="Custom">Custom</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Subcategory</label>
              <input 
                className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white text-sm"
                value={formData.subcategory || ''}
                onChange={e => handleChange('subcategory', e.target.value)}
                placeholder="e.g. QC, Alignment"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">Default Container (Docker Image)</label>
            <input 
              className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white text-sm font-mono"
              value={formData.default_container || ''}
              onChange={e => handleChange('default_container', e.target.value)}
              placeholder="e.g. ubuntu:20.04"
            />
          </div>

          {/* 参数配置 (JSON Editor) */}
          <div>
            <div className="flex justify-between items-center mb-1">
                <label className="block text-xs text-gray-400">Parameters Schema (JSON Schema)</label>
                {jsonError && <span className="text-xs text-red-400">{jsonError}</span>}
            </div>
            <textarea 
              className={`w-full bg-gray-950 border rounded p-2 text-white text-xs font-mono h-48 ${jsonError ? 'border-red-500' : 'border-gray-700'}`}
              value={formData.params_schema}
              onChange={e => handleChange('params_schema', e.target.value)}
            />
            <p className="text-[10px] text-gray-500 mt-1">
              Define inputs using standard JSON Schema. E.g., type, default, title.
            </p>
          </div>
          
          <div className="flex items-center gap-2">
             <input 
               type="checkbox" 
               checked={formData.is_public}
               onChange={e => handleChange('is_public', e.target.checked)}
               className="rounded bg-gray-800 border-gray-700"
             />
             <span className="text-sm text-gray-300">Publicly Visible</span>
          </div>
        </div>

        <div className="p-6 border-t border-gray-800 flex justify-end gap-3">
          <button onClick={onClose} className="text-gray-400 hover:text-white text-sm">Cancel</button>
          <button 
            onClick={handleSubmit} 
            className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium"
          >
            Save Workflow
          </button>
        </div>
      </div>
    </div>
  );
}