'use client';

import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import CodeEditor from './CodeEditor';
import DynamicParamsForm from './DynamicParamsForm';
import ChatPanel, { Message } from './ChatPanel';

interface WorkflowTemplate {
  id?: string;
  name: string;
  description?: string;
  category: string;
  subcategory?: string;
  workflow_type: string;
  script_path: string;
  source_code: string;
  config_code: string;
  default_container?: string;
  params_schema: string;
  is_public: boolean;
}

interface WorkflowEditorModalProps {
  initialData?: WorkflowTemplate;
  defaultType?: 'PIPELINE' | 'TOOL';
  onClose: () => void;
  onSave: () => void;
}

export default function WorkflowEditorModal({ initialData, defaultType = 'PIPELINE', onClose, onSave }: WorkflowEditorModalProps) {
  const DEFAULT_MAIN_NF = `nextflow.enable.dsl=2\n\nprocess SAY_HELLO {\n    script:\n    """\n    echo 'Hello World!'\n    """\n}\n\nworkflow {\n    SAY_HELLO()\n}`;
  
  const DEFAULT_TOOL_SCRIPT = `import argparse\nimport pandas as pd\n\ndef main():\n    parser = argparse.ArgumentParser(description='Custom Tool')\n    parser.add_argument('--input', type=str, required=True, help='Input file')\n    parser.add_argument('--output', type=str, default='output.tsv', help='Output file')\n    args = parser.parse_args()\n\n    # TODO: Add your logic here\n    print(f"Processing {args.input}...")\n\nif __name__ == '__main__':\n    main()`;
  
  const DEFAULT_CONFIG = `docker.enabled = true`;
  const DEFAULT_SCHEMA = `{\n  "type": "object",\n  "properties": {}\n}`;

  const [formData, setFormData] = useState<WorkflowTemplate>({
    name: '',
    description: '',
    category: 'Analysis',
    subcategory: '',
    workflow_type: defaultType,
    script_path: 'custom_script_' + Date.now(),
    source_code: defaultType === 'TOOL' ? DEFAULT_TOOL_SCRIPT : DEFAULT_MAIN_NF,
    config_code: DEFAULT_CONFIG,
    default_container: '',
    params_schema: DEFAULT_SCHEMA,
    is_public: true,
  });

  const [activeTab, setActiveTab] = useState<'general' | 'code' | 'config' | 'params'>('code');
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  // 👇 新增：解析状态
  const [isParsing, setIsParsing] = useState(false);

  const [chatHistory, setChatHistory] = useState<Message[]>([
    { 
      role: 'system', 
      content: defaultType === 'TOOL' 
        ? 'Hello! I am your AI Tool Developer. Tell me what Python/R script you want to create (e.g., "Create a script to draw a heatmap from a CSV").' 
        : 'Hello! I am your AI Workflow Architect. I can help you modify the code. Try "Add a CPUS parameter" or "Create a FastQC process".' 
    }
  ]);

  useEffect(() => {
    if (initialData) {
      setFormData({
        ...initialData,
        source_code: initialData.source_code || DEFAULT_MAIN_NF,
        config_code: initialData.config_code || DEFAULT_CONFIG,
        params_schema: initialData.params_schema || DEFAULT_SCHEMA,
        workflow_type: initialData.workflow_type || 'PIPELINE'
      });
    } else {
        setFormData(prev => ({
            ...prev,
            workflow_type: defaultType,
            source_code: defaultType === 'TOOL' ? DEFAULT_TOOL_SCRIPT : DEFAULT_MAIN_NF
        }));
    }
  }, [initialData, defaultType]);

  const handleChange = (field: keyof WorkflowTemplate, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (field === 'params_schema') {
      try {
        JSON.parse(value as string);
        setJsonError(null);
      } catch (e) {
        setJsonError("Invalid JSON");
      }
    }
    
    if (field === 'workflow_type' && value === 'TOOL' && activeTab === 'config') {
        setActiveTab('code');
    }
  };

  const handleSave = async () => {
    if (!formData.name) return toast.error("Name is required");
    if (jsonError) return toast.error("Fix JSON errors in Parameters tab");

    const loadingToast = toast.loading("Saving...");
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
        toast.success(initialData ? "Updated!" : "Created!", { id: loadingToast });
        onSave();
        onClose();
      } else {
        const err = await res.json();
        toast.error(`Error: ${err.detail}`, { id: loadingToast });
      }
    } catch (e) {
      toast.error("Network error", { id: loadingToast });
    }
  };

  const handleAIGenerate = async (userPrompt: string) => {
    setIsGenerating(true);
    const newHistory = [...chatHistory, { role: 'user', content: userPrompt } as Message];
    setChatHistory(newHistory);

    try {
      const token = localStorage.getItem('token');
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';

      const res = await fetch(`${apiUrl}/ai/generate`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json', 
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          messages: newHistory.filter(m => m.role !== 'system'),
          mode: formData.workflow_type, 
          current_code: formData.source_code 
        })
      });

      if (!res.ok) throw new Error('AI Service Failed');

      const data = await res.json();
      
      setFormData(prev => ({
        ...prev,
        source_code: data.main_nf,
        params_schema: data.params_schema,
        description: data.description || prev.description
      }));

      setChatHistory(prev => [
        ...prev, 
        { role: 'assistant', content: data.explanation || "Code updated successfully." }
      ]);

      setActiveTab('code');
      toast.success("Code updated!");

    } catch (e) {
      console.error(e);
      setChatHistory(prev => [
        ...prev, 
        { role: 'assistant', content: "❌ Sorry, I encountered an error generating the code. Please try again." }
      ]);
      toast.error("AI Generation failed");
    } finally {
      setIsGenerating(false);
    }
  };

  // 👇 新增：手动触发参数解析
  const handleParseParams = async () => {
    if (!formData.source_code) return toast.error("No code to parse");
    
    setIsParsing(true);
    const toastId = toast.loading("Analyzing code to extract parameters...");

    try {
      const token = localStorage.getItem('token');
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';

      const res = await fetch(`${apiUrl}/ai/parse_params`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          code: formData.source_code,
          mode: formData.workflow_type
        })
      });

      if (res.ok) {
        const data = await res.json();
        // 更新表单数据中的 params_schema
        handleChange('params_schema', data.params_schema);
        toast.success("Parameters updated from code!", { id: toastId });
      } else {
        throw new Error("Parse failed");
      }
    } catch (e) {
      toast.error("Failed to parse parameters", { id: toastId });
    } finally {
      setIsParsing(false);
    }
  };

  const TabBtn = ({ id, label }: { id: typeof activeTab, label: string }) => (
    <button
      onClick={() => setActiveTab(id)}
      className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
        activeTab === id 
          ? formData.workflow_type === 'TOOL' ? 'border-orange-500 text-orange-400' : 'border-blue-500 text-blue-400' 
          : 'border-transparent text-gray-400 hover:text-white'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-100 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-[95vw] h-[95vh] flex flex-col shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-800 flex justify-between items-center bg-[#18181b]">
          <div className="flex items-center gap-3">
             <div className={`p-2 rounded-lg ${formData.workflow_type === 'TOOL' ? 'bg-orange-600/20' : 'bg-purple-600/20'}`}>
                <span className="text-2xl">{formData.workflow_type === 'TOOL' ? '🛠️' : '✨'}</span>
             </div>
             <div>
                <h3 className="text-lg font-bold text-white">
                {initialData ? 'Edit ' : 'Create '}
                {formData.workflow_type === 'TOOL' ? 'Tool Script' : 'Workflow'}
                </h3>
                <p className="text-xs text-gray-500">
                    Mode: <span className={`font-bold ${formData.workflow_type === 'TOOL' ? 'text-orange-400' : 'text-blue-400'}`}>{formData.workflow_type}</span> 
                    {formData.workflow_type === 'PIPELINE' && " (AI can see existing modules)"}
                </p>
             </div>
          </div>
          
          <div className="flex gap-4 items-center">
             <div className="flex bg-gray-800 rounded-lg p-1">
                <TabBtn id="general" label="General" />
                <TabBtn id="code" label="Code" />
                <TabBtn id="params" label="Params" />
                {formData.workflow_type !== 'TOOL' && <TabBtn id="config" label="Config" />}
             </div>
             
             <div className="h-6 w-px bg-gray-700 mx-2"></div>

             <button onClick={onClose} className="text-gray-400 hover:text-white text-sm px-3">Cancel</button>
             <button 
                onClick={handleSave} 
                className="bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2 rounded-lg text-sm font-medium shadow-lg transition-all flex items-center gap-2"
             >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                Save & Publish
             </button>
          </div>
        </div>
        
        {/* Main Body */}
        <div className="flex flex-1 overflow-hidden">
            
            {/* Left: Chat Panel */}
            <div className="w-[35%] min-w-[320px] h-full border-r border-gray-700">
                <ChatPanel 
                    messages={chatHistory}  
                    onSend={handleAIGenerate} 
                    isGenerating={isGenerating} 
                />
            </div>

            {/* Right: Editor Area */}
            <div className="flex-1 bg-[#0d1117] h-full flex flex-col overflow-hidden relative">
                
                {/* General Tab */}
                {activeTab === 'general' && (
                    <div className="p-8 max-w-2xl mx-auto w-full space-y-6 overflow-y-auto">
                        <div className="grid grid-cols-2 gap-6">
                            <div>
                                <label className="block text-xs text-gray-400 mb-1">Name</label>
                                <input 
                                    className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white"
                                    value={formData.name}
                                    onChange={e => handleChange('name', e.target.value)}
                                    placeholder={formData.workflow_type === 'TOOL' ? "e.g. Draw Heatmap" : "e.g. FastQC Module"}
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-gray-400 mb-1">Type</label>
                                <select 
                                    className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white"
                                    value={formData.workflow_type}
                                    onChange={e => handleChange('workflow_type', e.target.value)}
                                >
                                    <option value="PIPELINE">Pipeline</option>
                                    <option value="MODULE">Module</option>
                                    <option value="TOOL">Tool (Script)</option>
                                </select>
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs text-gray-400 mb-1">Description</label>
                            <textarea 
                                className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white h-32"
                                value={formData.description || ''}
                                onChange={e => handleChange('description', e.target.value)}
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-6">
                            <div>
                            <label className="block text-xs text-gray-400 mb-1">Category</label>
                            <select 
                                className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white"
                                value={formData.category}
                                onChange={e => handleChange('category', e.target.value)}
                            >
                                <option value="Analysis">Analysis</option>
                                <option value="Utility">Utility</option>
                                <option value="Visualization">Visualization</option>
                                <option value="Custom">Custom</option>
                            </select>
                            </div>
                            <div>
                            <label className="block text-xs text-gray-400 mb-1">Subcategory</label>
                            <input 
                                className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white"
                                value={formData.subcategory || ''}
                                onChange={e => handleChange('subcategory', e.target.value)}
                            />
                            </div>
                        </div>
                    </div>
                )}

                {/* Code Tab */}
                {activeTab === 'code' && (
                    <div className="flex-1 flex flex-col">
                        <div className="px-4 py-1 bg-[#1e1e1e] border-b border-gray-700 text-xs text-gray-500 flex justify-between">
                            <span className="flex items-center gap-2">
                                {formData.workflow_type === 'TOOL' ? 'script.py / script.R' : 'main.nf'}
                                <span className="text-gray-600">|</span>
                                <span>{formData.source_code.length} chars</span>
                            </span>
                            
                            {/* 👇 代码页面也可以加一个快捷解析按钮 */}
                            <button 
                                onClick={handleParseParams}
                                disabled={isParsing}
                                className="flex items-center gap-1 text-blue-400 hover:text-blue-300 transition-colors disabled:opacity-50"
                            >
                                {isParsing ? 'Parsing...' : '⚡ Extract Params from Code'}
                            </button>
                        </div>
                        <div className="flex-1 relative">
                             <CodeEditor 
                                language={formData.workflow_type === 'TOOL' ? 'python' : 'nextflow'} 
                                value={formData.source_code} 
                                onChange={val => handleChange('source_code', val || '')} 
                                height="100%"
                            />
                        </div>
                    </div>
                )}

                {/* Params Tab */}
                {activeTab === 'params' && (
                    <div className="flex flex-1 overflow-hidden">
                        <div className="w-1/2 flex flex-col border-r border-gray-700">
                             <div className="px-4 py-2 bg-[#1e1e1e] border-b border-gray-700 flex justify-between items-center">
                                <span className="text-xs text-gray-500">JSON Schema</span>
                                {/* 👇 新增：同步参数按钮 */}
                                <button 
                                    onClick={handleParseParams}
                                    disabled={isParsing}
                                    className="bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 text-xs px-3 py-1 rounded border border-blue-600/50 transition-all flex items-center gap-2"
                                >
                                    {isParsing ? (
                                        <span className="animate-spin">↻</span> 
                                    ) : (
                                        <span>🔄</span>
                                    )}
                                    {isParsing ? 'Analyzing...' : 'Sync from Code'}
                                </button>
                             </div>
                             <div className="flex-1 relative">
                                <CodeEditor 
                                    language="json" 
                                    value={formData.params_schema} 
                                    onChange={val => handleChange('params_schema', val || '{}')} 
                                    height="100%"
                                />
                             </div>
                             {jsonError && <div className="px-4 py-2 bg-red-900/50 text-red-300 text-xs">{jsonError}</div>}
                        </div>
                        <div className="w-1/2 flex flex-col bg-gray-900">
                             <div className="px-4 py-1 bg-[#1e1e1e] border-b border-gray-700 text-xs text-blue-400 font-bold uppercase">UI Preview</div>
                             <div className="flex-1 p-6 overflow-y-auto">
                                <DynamicParamsForm 
                                    schemaStr={formData.params_schema}
                                    onChange={() => {}} 
                                />
                             </div>
                        </div>
                    </div>
                )}

                 {/* Config Tab (仅 Pipeline/Module 可见) */}
                 {activeTab === 'config' && formData.workflow_type !== 'TOOL' && (
                    <div className="flex-1 flex flex-col">
                        <div className="px-4 py-1 bg-[#1e1e1e] border-b border-gray-700 text-xs text-gray-500">nextflow.config</div>
                        <div className="flex-1 relative">
                             <CodeEditor 
                                language="properties" 
                                value={formData.config_code} 
                                onChange={val => handleChange('config_code', val || '')} 
                                height="100%"
                            />
                        </div>
                    </div>
                )}
            </div>
        </div>
      </div>
    </div>
  );
}