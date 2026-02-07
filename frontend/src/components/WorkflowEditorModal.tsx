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
  workflow_type: string; // 👈 修改这里
  script_path: string;
  source_code: string;
  config_code: string;
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
  const DEFAULT_MAIN_NF = `nextflow.enable.dsl=2\n\nprocess SAY_HELLO {\n    script:\n    """\n    echo 'Hello World!'\n    """\n}\n\nworkflow {\n    SAY_HELLO()\n}`;
  const DEFAULT_CONFIG = `docker.enabled = true`;
  const DEFAULT_SCHEMA = `{\n  "type": "object",\n  "properties": {}\n}`;

  const [formData, setFormData] = useState<WorkflowTemplate>({
    name: '',
    description: '',
    category: 'Analysis',
    subcategory: '',
    workflow_type: 'PIPELINE', // 👈 修改默认值
    script_path: 'custom_flow_' + Date.now(),
    source_code: DEFAULT_MAIN_NF,
    config_code: DEFAULT_CONFIG,
    default_container: '',
    params_schema: DEFAULT_SCHEMA,
    is_public: true,
  });

  const [activeTab, setActiveTab] = useState<'general' | 'code' | 'config' | 'params'>('code');
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [chatHistory, setChatHistory] = useState<Message[]>([
    { 
      role: 'system', 
      content: 'Hello! I am your AI Workflow Architect. I can help you modify the code. Try "Add a CPUS parameter" or "Create a FastQC process".' 
    }
  ]);

  useEffect(() => {
    if (initialData) {
      setFormData({
        ...initialData,
        source_code: initialData.source_code || DEFAULT_MAIN_NF,
        config_code: initialData.config_code || DEFAULT_CONFIG,
        params_schema: initialData.params_schema || DEFAULT_SCHEMA,
        workflow_type: initialData.workflow_type || 'PIPELINE' // 👈 适配旧数据
      });
    }
  }, [initialData]);

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
  };

  const handleSave = async () => {
    if (!formData.name) return toast.error("Name is required");
    if (jsonError) return toast.error("Fix JSON errors in Parameters tab");

    const loadingToast = toast.loading("Saving workflow...");
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
          mode: formData.workflow_type, // 👈 传递 workflow_type
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

  const TabBtn = ({ id, label }: { id: typeof activeTab, label: string }) => (
    <button
      onClick={() => setActiveTab(id)}
      className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
        activeTab === id 
          ? 'border-blue-500 text-blue-400' 
          : 'border-transparent text-gray-400 hover:text-white'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-[95vw] h-[95vh] flex flex-col shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-800 flex justify-between items-center bg-[#18181b]">
          <div className="flex items-center gap-3">
             <div className="bg-purple-600/20 p-2 rounded-lg">
                <span className="text-2xl">✨</span>
             </div>
             <div>
                <h3 className="text-lg font-bold text-white">
                {initialData ? 'Edit Workflow' : 'AI Workflow Designer'}
                </h3>
                <p className="text-xs text-gray-500">
                    Mode: <span className="text-blue-400 font-bold">{formData.workflow_type}</span> 
                    {formData.workflow_type === 'PIPELINE' && " (AI can see existing modules)"}
                </p>
             </div>
          </div>
          
          <div className="flex gap-4 items-center">
             <div className="flex bg-gray-800 rounded-lg p-1">
                <TabBtn id="general" label="General" />
                <TabBtn id="code" label="Code" />
                <TabBtn id="params" label="Params" />
                <TabBtn id="config" label="Config" />
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
            
            {/* Left: Chat Panel (35%) */}
            <div className="w-[35%] min-w-[320px] h-full border-r border-gray-700">
                <ChatPanel 
                    messages={chatHistory}  
                    onSend={handleAIGenerate} 
                    isGenerating={isGenerating} 
                />
            </div>

            {/* Right: Editor Area (65%) */}
            <div className="flex-1 bg-[#0d1117] h-full flex flex-col overflow-hidden relative">
                
                {/* General Tab */}
                {activeTab === 'general' && (
                    <div className="p-8 max-w-2xl mx-auto w-full space-y-6 overflow-y-auto">
                        <div className="grid grid-cols-2 gap-6">
                            <div>
                                <label className="block text-xs text-gray-400 mb-1">Workflow Name</label>
                                <input 
                                    className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white"
                                    value={formData.name}
                                    onChange={e => handleChange('name', e.target.value)}
                                    placeholder="e.g. FastQC Module"
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-gray-400 mb-1">Type</label>
                                <select 
                                    className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white"
                                    value={formData.workflow_type}
                                    onChange={e => handleChange('workflow_type', e.target.value)} // 👈 修改
                                >
                                    <option value="PIPELINE">Pipeline</option>
                                    <option value="MODULE">Module</option>
                                </select>
                            </div>
                        </div>
                        {/* ... description & category ... */}
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
                            <span>main.nf</span>
                            <span>{formData.source_code.length} chars</span>
                        </div>
                        <div className="flex-1 relative">
                             <CodeEditor 
                                language="nextflow" 
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
                             <div className="px-4 py-1 bg-[#1e1e1e] border-b border-gray-700 text-xs text-gray-500">JSON Schema</div>
                             <div className="flex-1 relative">
                                <CodeEditor 
                                    language="json" 
                                    value={formData.params_schema} 
                                    onChange={val => handleChange('params_schema', val || '{}')} 
                                    height="100%"
                                />
                             </div>
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

                 {/* Config Tab */}
                 {activeTab === 'config' && (
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