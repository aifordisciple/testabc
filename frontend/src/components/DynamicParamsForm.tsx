'use client';

import { useState, useEffect } from 'react';

interface SchemaProperty {
  type: string;
  title?: string;
  default?: any;
  description?: string;
  enum?: string[];
}

interface DynamicParamsFormProps {
  schemaStr: string;
  onChange: (values: Record<string, any>) => void;
}

export default function DynamicParamsForm({ schemaStr, onChange }: DynamicParamsFormProps) {
  const [schema, setSchema] = useState<any>(null);
  const [formValues, setFormValues] = useState<Record<string, any>>({});

  // 1. 解析 Schema 并初始化默认值
  useEffect(() => {
    try {
      const parsed = JSON.parse(schemaStr);
      setSchema(parsed);
      
      // 提取默认值
      const defaults: Record<string, any> = {};
      if (parsed.properties) {
        Object.entries(parsed.properties).forEach(([key, prop]: [string, any]) => {
          if (prop.default !== undefined) {
            defaults[key] = prop.default;
          }
        });
      }
      setFormValues(defaults);
      onChange(defaults); // 通知父组件初始值
    } catch (e) {
      console.error("Invalid Schema JSON", e);
    }
  }, [schemaStr]);

  const handleInputChange = (key: string, value: any) => {
    const newValues = { ...formValues, [key]: value };
    setFormValues(newValues);
    onChange(newValues);
  };

  if (!schema || !schema.properties) {
    return <div className="text-gray-500 text-xs italic">No configurable parameters.</div>;
  }

  return (
    <div className="space-y-4">
      {Object.entries(schema.properties).map(([key, prop]: [string, any]) => (
        <div key={key} className="space-y-1">
          <div className="flex justify-between">
            <label className="block text-xs font-medium text-gray-300">
              {prop.title || key}
            </label>
            {prop.default !== undefined && (
               <span className="text-[10px] text-gray-600">Default: {String(prop.default)}</span>
            )}
          </div>
          
          {/* Boolean -> Checkbox / Toggle */}
          {prop.type === 'boolean' && (
            <div className="flex items-center gap-2 mt-1">
              <button
                type="button"
                onClick={() => handleInputChange(key, !formValues[key])}
                className={`w-10 h-5 rounded-full relative transition-colors ${
                  formValues[key] ? 'bg-blue-600' : 'bg-gray-700'
                }`}
              >
                <div 
                  className={`w-3 h-3 bg-white rounded-full absolute top-1 transition-all ${
                    formValues[key] ? 'left-6' : 'left-1'
                  }`} 
                />
              </button>
              <span className="text-xs text-gray-400">
                {formValues[key] ? 'Enabled' : 'Disabled'}
              </span>
            </div>
          )}

          {/* String / Integer -> Input */}
          {(prop.type === 'string' || prop.type === 'integer' || prop.type === 'number') && (
            <input
              type={prop.type === 'integer' || prop.type === 'number' ? 'number' : 'text'}
              className="w-full bg-gray-950 border border-gray-700 rounded px-2 py-1.5 text-sm text-white focus:border-blue-500 outline-none transition-colors"
              value={formValues[key] || ''}
              onChange={(e) => {
                const val = e.target.value;
                // 处理数字转换
                if (prop.type === 'integer') handleInputChange(key, parseInt(val) || 0);
                else if (prop.type === 'number') handleInputChange(key, parseFloat(val) || 0);
                else handleInputChange(key, val);
              }}
              placeholder={prop.description}
            />
          )}
          
          {prop.description && (
            <p className="text-[10px] text-gray-500">{prop.description}</p>
          )}
        </div>
      ))}
    </div>
  );
}