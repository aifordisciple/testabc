'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import WorkflowEditorModal from '@/components/WorkflowEditorModal';
import ConfirmModal from '@/components/ConfirmModal';

interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  subcategory: string;
  workflow_type: string; 
  script_path: string;
  source_code: string;   
  config_code: string;   
  params_schema: string;
  is_public: boolean;
  updated_at: string;
}

export default function AdminWorkflowsPage() {
  const router = useRouter();
  const [workflows, setWorkflows] = useState<WorkflowTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Modal states
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingWorkflow, setEditingWorkflow] = useState<WorkflowTemplate | undefined>(undefined);
  
  // 👈 新增：记录当前想要创建的类型，传递给 EditorModal
  const [createType, setCreateType] = useState<'PIPELINE' | 'TOOL'>('PIPELINE');
  
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    action: () => void;
  }>({ isOpen: false, title: '', message: '', action: () => {} });

  const fetchWorkflows = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
          router.push('/');
          return;
      }
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
      const res = await fetch(`${apiUrl}/admin/workflows`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setWorkflows(await res.json());
      }
    } catch (e) {
      toast.error("Failed to load workflows");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWorkflows();
  }, []);

  // 👈 修改：接受创建类型参数
  const handleCreate = (type: 'PIPELINE' | 'TOOL') => {
    setCreateType(type);
    setEditingWorkflow(undefined);
    setIsEditorOpen(true);
  };

  const handleEdit = (wf: WorkflowTemplate) => {
    setEditingWorkflow(wf);
    setIsEditorOpen(true);
  };

  const handleDeleteClick = (wf: WorkflowTemplate) => {
    setConfirmModal({
      isOpen: true,
      title: "Delete Workflow",
      message: `Are you sure you want to delete "${wf.name}"? This might break existing analysis history.`,
      action: () => deleteWorkflow(wf.id)
    });
  };

  const deleteWorkflow = async (id: string) => {
    try {
      const token = localStorage.getItem('token');
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
      const res = await fetch(`${apiUrl}/admin/workflows/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        toast.success("Deleted");
        fetchWorkflows();
      } else {
        toast.error("Delete failed");
      }
    } catch (e) { toast.error("Network error"); }
  };

  // Group by Category
  const groupedWorkflows = workflows.reduce((acc, wf) => {
    const key = wf.category || 'Uncategorized';
    if (!acc[key]) acc[key] = [];
    acc[key].push(wf);
    return acc;
  }, {} as Record<string, WorkflowTemplate[]>);

  if (loading) return <div className="min-h-screen bg-gray-950 flex items-center justify-center text-white">Loading...</div>;

  return (
    <div className="min-h-screen bg-gray-950 text-white p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8 border-b border-gray-800 pb-6">
          <div>
            <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-400">
              Workflow & Tools Management
            </h1>
            <p className="text-gray-400 mt-2 text-sm">
              Design, configure, and manage analysis pipelines and custom tools.
            </p>
          </div>
          <div className="flex gap-3">
            <button 
                onClick={() => router.push('/dashboard')}
                className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
            >
                &larr; Back to Dashboard
            </button>
            {/* 👈 新增：Create Tool 按钮 */}
            <button 
              onClick={() => handleCreate('TOOL')}
              className="bg-orange-600 hover:bg-orange-500 text-white px-6 py-2 rounded-lg font-medium transition-all shadow-lg shadow-orange-900/20"
            >
              + Create Tool
            </button>
            <button 
              onClick={() => handleCreate('PIPELINE')}
              className="bg-purple-600 hover:bg-purple-500 text-white px-6 py-2 rounded-lg font-medium transition-all shadow-lg shadow-purple-900/20"
            >
              + Create Workflow
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="space-y-12">
          {Object.entries(groupedWorkflows).map(([category, items]) => (
            <div key={category}>
              <h2 className="text-xl font-bold text-gray-300 mb-6 flex items-center gap-3">
                <span className="w-2.5 h-2.5 bg-purple-500 rounded-full shadow-[0_0_10px_rgba(168,85,247,0.5)]"></span>
                {category}
              </h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                {items.map(wf => (
                  <div key={wf.id} className="bg-gray-900/50 border border-gray-800 rounded-xl p-6 hover:border-purple-500/30 hover:bg-gray-900 transition-all group relative overflow-hidden">
                    {/* Badge */}
                    <div className="absolute top-0 right-0 p-4">
                        <span className={`text-[10px] font-bold px-2 py-1 rounded border ${
                            wf.workflow_type === 'MODULE' 
                            ? 'text-blue-400 border-blue-900 bg-blue-900/10' 
                            : wf.workflow_type === 'TOOL' // 👈 新增：Tool 的专属橙色徽章
                            ? 'text-orange-400 border-orange-900 bg-orange-900/10'
                            : 'text-emerald-400 border-emerald-900 bg-emerald-900/10'
                        }`}>
                            {wf.workflow_type}
                        </span>
                    </div>

                    <div className="mb-4">
                      <span className="text-xs font-mono text-purple-400/80 bg-purple-900/10 px-2 py-1 rounded">
                        {wf.subcategory || 'General'}
                      </span>
                    </div>
                    
                    <h3 className="font-bold text-lg mb-2 text-gray-100">{wf.name}</h3>
                    <p className="text-gray-500 text-sm mb-6 line-clamp-2 h-10 leading-relaxed">
                      {wf.description || "No description provided."}
                    </p>
                    
                    <div className="flex justify-between items-end border-t border-gray-800/50 pt-4">
                        <div className="text-[10px] text-gray-600 font-mono">
                            Last updated: {new Date(wf.updated_at).toLocaleDateString()}
                        </div>
                        
                        <div className="flex gap-3">
                            <button 
                            onClick={() => handleEdit(wf)}
                            className="text-gray-400 hover:text-white transition-colors"
                            title="Edit"
                            >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                            </button>
                            <button 
                            onClick={() => handleDeleteClick(wf)}
                            className="text-gray-600 hover:text-red-400 transition-colors"
                            title="Delete"
                            >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            </button>
                        </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {isEditorOpen && (
        <WorkflowEditorModal 
          initialData={editingWorkflow}
          defaultType={createType} // 👈 传递给 Editor 以便知道初始模式
          onClose={() => setIsEditorOpen(false)}
          onSave={fetchWorkflows}
        />
      )}

      <ConfirmModal 
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmModal.action}
      />
    </div>
  );
}