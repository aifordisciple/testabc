'use client';

import { useState, useEffect } from 'react';

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
}

export default function DynamicParamsForm({ schemaStr, onChange, uploadedFiles = [] }: DynamicParamsFormProps) {
  const [schema, setSchema] = useState<any>(null);
  const [formData, setFormData] = useState<Record<string, any>>({});
  
  // 记录哪些 string 类型的字段处于 "文件选择" 模式
  const [fileMode, setFileMode] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      const parsed = JSON.parse(schemaStr);
      setSchema(parsed);
      
      const initial: Record<string, any> = {};
      const initialMode: Record<string, boolean> = {};
      
      if (parsed.properties) {
        Object.keys(parsed.properties).forEach(key => {
          const prop = parsed.properties[key];
          
          // 设置默认值
          if (prop.default !== undefined) {
            initial[key] = prop.default;
          } else if (prop.enum && prop.enum.length > 0) {
            initial[key] = prop.enum[0]; // 如果有 enum 但没默认值，默认选第一个
          } else {
            initial[key] = prop.type === 'boolean' ? false : '';
          }
          
          // 智能推断文件模式 (仅当该字段不是 enum 时)
          const isEnum = prop.enum && Array.isArray(prop.enum) && prop.enum.length > 0;
          if (!isEnum) {
            const keyLower = key.toLowerCase();
            if (
              keyLower.includes('file') || 
              keyLower.includes('input') || 
              keyLower.includes('path') ||
              keyLower.includes('csv') ||
              keyLower.includes('tsv') ||
              keyLower.includes('matrix') ||
              keyLower.includes('fasta') ||
              keyLower.includes('bam')
            ) {
              initialMode[key] = true;
            }
          }
        });
      }
      setFormData(initial);
      setFileMode(initialMode);
      onChange(initial);
    } catch (e) {
      setSchema(null);
    }
  }, [schemaStr]);

  const handleChange = (key: string, val: any) => {
    const newData = { ...formData, [key]: val };
    setFormData(newData);
    onChange(newData);
  };

  const toggleFileMode = (key: string) => {
    const isFile = !fileMode[key];
    setFileMode(prev => ({ ...prev, [key]: isFile }));
    // 切换模式时清空值
    handleChange(key, '');
  };

  if (!schema || !schema.properties) return <div className="text-gray-500 text-sm">No parameters defined.</div>;

  return (
    <div className="space-y-4">
      {Object.keys(schema.properties).map(key => {
        const prop = schema.properties[key];
        const isFileSelection = fileMode[key];
        
        // 判断是否为 Enum 类型
        const isEnum = prop.enum && Array.isArray(prop.enum) && prop.enum.length > 0;

        return (
          <div key={key} className="flex flex-col border-b border-gray-800/50 pb-3 last:border-0">
            <div className="flex justify-between items-center mb-2">
              <label className="text-xs text-gray-300 font-bold tracking-wide flex items-center gap-2">
                {prop.title || key}
                {prop.required && <span className="text-red-500">*</span>}
              </label>
              
              {/* 只有 String 类型且不是 Enum 时，才显示文件切换按钮 */}
              {prop.type === 'string' && !isEnum && uploadedFiles.length > 0 && (
                <button
                  type="button"
                  onClick={() => toggleFileMode(key)}
                  className={`text-[10px] px-2 py-1 rounded transition-colors ${
                    isFileSelection 
                      ? 'bg-blue-900/40 text-blue-400 border border-blue-900' 
                      : 'bg-gray-800 text-gray-400 border border-gray-700 hover:text-white'
                  }`}
                >
                  {isFileSelection ? '📁 Select Uploaded File' : '✍️ Manual Text'}
                </button>
              )}
            </div>

            {/* 渲染逻辑分支 */}
            {prop.type === 'boolean' ? (
              // 1. Boolean -> Select (True/False)
              <select
                className="bg-gray-900 border border-gray-700 rounded p-2 text-sm text-white focus:border-blue-500 outline-none"
                value={formData[key] ? 'true' : 'false'}
                onChange={e => handleChange(key, e.target.value === 'true')}
              >
                <option value="true">True</option>
                <option value="false">False</option>
              </select>

            ) : isEnum ? (
              // 2. Enum -> Select (Options) [新增逻辑]
              <select
                className="bg-gray-900 border border-gray-700 rounded p-2 text-sm text-white focus:border-blue-500 outline-none"
                value={formData[key] || ''}
                onChange={e => {
                    const val = e.target.value;
                    // 如果 Schema 定义是数字，转换回数字
                    const finalVal = (prop.type === 'integer' || prop.type === 'number') ? Number(val) : val;
                    handleChange(key, finalVal);
                }}
              >
                {prop.enum.map((opt: any) => (
                    <option key={opt} value={opt}>
                        {opt}
                    </option>
                ))}
              </select>

            ) : prop.type === 'string' && isFileSelection ? (
              // 3. File Mode -> Select (Files)
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

            ) : (
              // 4. Default -> Input (Text/Number)
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