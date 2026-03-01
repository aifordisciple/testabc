'use client';

import { useState, useEffect } from 'react';
import { toast } from '@/components/ui/Toast';

// 定义文件接口
interface ProjectFile {
  id: string;
  filename: string;
  s3_key: string;
}

interface DynamicParamsFormProps {
  schemaStr: string;
  onChange: (params: Record<string, any>) => void;
  uploadedFiles?: ProjectFile[];
  projectId?: string; // 👈 新增：需要项目ID来上传文件
}

type FieldMode = 'text' | 'server' | 'local';

export default function DynamicParamsForm({ schemaStr, onChange, uploadedFiles = [], projectId }: DynamicParamsFormProps) {
  const [schema, setSchema] = useState<any>(null);
  const [formData, setFormData] = useState<Record<string, any>>({});
  
  // 记录每个字段的输入模式
  const [fieldModes, setFieldModes] = useState<Record<string, FieldMode>>({});
  
  // 上传状态
  const [uploading, setUploading] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      const parsed = JSON.parse(schemaStr);
      setSchema(parsed);
      
      const initial: Record<string, any> = {};
      const initialModes: Record<string, FieldMode> = {};
      
      if (parsed.properties) {
        Object.keys(parsed.properties).forEach(key => {
          const prop = parsed.properties[key];
          
          // 设置默认值
          if (prop.default !== undefined) {
            initial[key] = prop.default;
          } else if (prop.enum && prop.enum.length > 0) {
            initial[key] = prop.enum[0];
          } else {
            initial[key] = prop.type === 'boolean' ? false : '';
          }
          
          // 智能推断初始模式
          const isEnum = prop.enum && Array.isArray(prop.enum) && prop.enum.length > 0;
          if (!isEnum && prop.type === 'string') {
            const keyLower = key.toLowerCase();
            const isFileLike = ['file', 'input', 'path', 'csv', 'tsv', 'fastq', 'bam'].some(k => keyLower.includes(k));
            
            if (isFileLike) {
                // 如果有已上传文件，优先显示选择列表，否则显示本地上传（如果有项目ID），最后才显示文本
                if (uploadedFiles.length > 0) initialModes[key] = 'server';
                else if (projectId) initialModes[key] = 'local';
                else initialModes[key] = 'text';
            } else {
                initialModes[key] = 'text';
            }
          }
        });
      }
      setFormData(initial);
      setFieldModes(initialModes);
      onChange(initial);
    } catch (e) {
      setSchema(null);
    }
  }, [schemaStr, uploadedFiles.length, projectId]);

  const handleChange = (key: string, val: any) => {
    const newData = { ...formData, [key]: val };
    setFormData(newData);
    onChange(newData);
  };

  // 切换模式逻辑: Text -> Server -> Local -> Text
  const cycleMode = (key: string) => {
    const current = fieldModes[key] || 'text';
    const hasServerFiles = uploadedFiles.length > 0;
    const canUpload = !!projectId; // 只有在项目上下文中才能上传

    let next: FieldMode = 'text';

    if (current === 'text') {
        if (hasServerFiles) next = 'server';
        else if (canUpload) next = 'local';
    } else if (current === 'server') {
        if (canUpload) next = 'local';
        else next = 'text';
    } else if (current === 'local') {
        next = 'text';
    }

    setFieldModes(prev => ({ ...prev, [key]: next }));
    handleChange(key, ''); // 切换模式时清空值
  };

  // 处理本地文件上传
  const handleFileUpload = async (key: string, file: File) => {
    if (!projectId) return toast.error("Project context missing.");
    
    setUploading(prev => ({ ...prev, [key]: true }));
    const toastId = toast.loading(`Uploading ${file.name}...`);

    try {
        const token = localStorage.getItem('token');
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
        
        const form = new FormData();
        form.append('file', file);

        // 假设上传接口为 POST /files/projects/{id}/files
        const res = await fetch(`${apiUrl}/files/projects/${projectId}/files`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: form
        });

        if (res.ok) {
            const data = await res.json();
            // 假设后端返回 { s3_key: "..." } 或 { file: { s3_key: "..." } }
            const s3Key = data.s3_key || data.file?.s3_key;
            
            if (s3Key) {
                const serverPath = `/data/uploads/${s3Key}`;
                handleChange(key, serverPath);
                toast.success("Uploaded & Selected!", { id: toastId });
            } else {
                toast.error("Upload successful but path not found.", { id: toastId });
            }
        } else {
            toast.error("Upload failed.", { id: toastId });
        }
    } catch (e) {
        toast.error("Network error during upload.", { id: toastId });
    } finally {
        setUploading(prev => ({ ...prev, [key]: false }));
    }
  };

  if (!schema || !schema.properties) return <div className="text-gray-500 text-sm">No parameters defined.</div>;

  return (
    <div className="space-y-5">
      {Object.keys(schema.properties).map(key => {
        const prop = schema.properties[key];
        const mode = fieldModes[key] || 'text';
        const isEnum = prop.enum && Array.isArray(prop.enum) && prop.enum.length > 0;
        const isString = prop.type === 'string';

        return (
          <div key={key} className="flex flex-col border-b border-gray-800/50 pb-4 last:border-0 group">
            <div className="flex justify-between items-center mb-2">
              <label className="text-xs text-gray-300 font-bold tracking-wide flex items-center gap-2">
                {prop.title || key}
                {prop.required && <span className="text-red-500">*</span>}
              </label>
              
              {/* 模式切换按钮 */}
              {isString && !isEnum && (uploadedFiles.length > 0 || projectId) && (
                <button
                  type="button"
                  onClick={() => cycleMode(key)}
                  className={`text-[10px] px-2 py-1 rounded transition-colors flex items-center gap-1.5 ${
                    mode === 'server' ? 'bg-blue-900/30 text-blue-400 border border-blue-800' :
                    mode === 'local' ? 'bg-emerald-900/30 text-emerald-400 border border-emerald-800' :
                    'bg-gray-800 text-gray-400 border border-gray-700 hover:text-white'
                  }`}
                  title="Click to switch input mode"
                >
                  {mode === 'server' && <span>📁 Server File</span>}
                  {mode === 'local' && <span>💻 Local Upload</span>}
                  {mode === 'text' && <span>✍️ Manual Input</span>}
                  <span className="opacity-50 text-[8px]">▼</span>
                </button>
              )}
            </div>

            {/* --- 渲染逻辑 --- */}
            
            {/* 1. Boolean */}
            {prop.type === 'boolean' ? (
              <select
                className="bg-gray-900 border border-gray-700 rounded p-2 text-sm text-white focus:border-blue-500 outline-none"
                value={formData[key] ? 'true' : 'false'}
                onChange={e => handleChange(key, e.target.value === 'true')}
              >
                <option value="true">True</option>
                <option value="false">False</option>
              </select>

            // 2. Enum
            ) : isEnum ? (
              <select
                className="bg-gray-900 border border-gray-700 rounded p-2 text-sm text-white focus:border-blue-500 outline-none"
                value={formData[key] || ''}
                onChange={e => handleChange(key, e.target.value)}
              >
                {prop.enum.map((opt: any) => (
                    <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>

            // 3. String - Server File Mode
            ) : isString && mode === 'server' ? (
              <select
                className="bg-gray-900 border border-blue-900/50 rounded p-2 text-sm text-white focus:border-blue-500 outline-none shadow-[0_0_10px_rgba(59,130,246,0.1)]"
                value={formData[key] || ''}
                onChange={e => handleChange(key, e.target.value)}
              >
                <option value="">-- Select a file from project --</option>
                {uploadedFiles.map(f => (
                  <option key={f.id} value={`/data/uploads/${f.s3_key}`}>
                    📄 {f.filename}
                  </option>
                ))}
              </select>

            // 4. String - Local Upload Mode [NEW]
            ) : isString && mode === 'local' ? (
                <div className={`relative border border-dashed rounded-lg p-3 transition-colors text-center ${formData[key] ? 'border-emerald-500/50 bg-emerald-900/10' : 'border-emerald-700/50 hover:bg-emerald-900/5'}`}>
                    {uploading[key] ? (
                        <div className="text-emerald-400 text-xs flex items-center justify-center gap-2">
                            <span className="animate-spin">↻</span> Uploading...
                        </div>
                    ) : formData[key] ? (
                        <div className="flex items-center justify-between gap-2">
                            <span className="text-xs text-emerald-400 truncate flex-1 text-left" title={formData[key]}>
                                ✅ Ready: ...{String(formData[key]).slice(-20)}
                            </span>
                            <button 
                                onClick={() => handleChange(key, '')} 
                                className="text-gray-500 hover:text-white text-xs px-1"
                            >✕</button>
                        </div>
                    ) : (
                        <label className="cursor-pointer block">
                            <input 
                                type="file" 
                                className="hidden" 
                                onChange={(e) => e.target.files?.[0] && handleFileUpload(key, e.target.files[0])}
                            />
                            <div className="text-emerald-500 text-xs font-medium hover:text-emerald-400 transition-colors flex items-center justify-center gap-2">
                                <span>📤</span> Click to Upload Local File
                            </div>
                        </label>
                    )}
                </div>

            // 5. Default - Manual Text / Number
            ) : (
              <input
                type={prop.type === 'integer' || prop.type === 'number' ? 'number' : 'text'}
                className="bg-gray-900 border border-gray-700 rounded p-2 text-sm text-white focus:border-blue-500 outline-none"
                value={formData[key] !== undefined ? formData[key] : ''}
                placeholder={prop.default ? `Default: ${prop.default}` : `Enter ${key}...`}
                onChange={e => handleChange(key, prop.type === 'integer' || prop.type === 'number' ? (parseFloat(e.target.value) || 0) : e.target.value)}
              />
            )}
            
            {prop.description && <p className="text-[10px] text-gray-500 mt-1.5">{prop.description}</p>}
          </div>
        );
      })}
    </div>
  );
}