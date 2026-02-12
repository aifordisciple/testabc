'use client';

import { useState, useEffect } from 'react';
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

interface WorkflowManagerProps {
    onBack?: () => void;
}

export default function WorkflowManager({ onBack }: WorkflowManagerProps) {
  const [workflows, setWorkflows] = useState<WorkflowTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingWorkflow, setEditingWorkflow] = useState<WorkflowTemplate | undefined>(undefined);
  const [createType, setCreateType] = useState<'PIPELINE' | 'TOOL'>('PIPELINE');
  const [confirmModal, setConfirmModal] = useState<{isOpen: boolean; title: string; message: string; action: () => void;}>({ isOpen: false, title: '', message: '', action: () => {} });

  const fetchWorkflows = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
      const res = await fetch(`${apiUrl}/admin/workflows`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) setWorkflows(await res.json());
    } catch (e) {
      toast.error("Failed to load workflows");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchWorkflows(); }, []);

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
      message: `Delete "${wf.name}"? This might break existing history.`,
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
      if (res.ok) { toast.success("Deleted"); fetchWorkflows(); } 
      else { toast.error("Delete failed"); }
    } catch (e) { toast.error("Network error"); }
  };

  const groupedWorkflows = workflows.reduce((acc, wf) => {
    const key = wf.category || 'Uncategorized';
    if (!acc[key]) acc[key] = [];
    acc[key].push(wf);
    return acc;
  }, {} as Record<string, WorkflowTemplate[]>);

  if (loading) return <div className="h-full flex items-center justify-center text-gray-500">Loading Workflows...</div>;

  return (
    <div className="h-full flex flex-col bg-gray-950 text-white overflow-hidden">
      {/* Header */}
      <div className="px-8 py-6 border-b border-gray-800 bg-gray-900/30 flex-shrink-0">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3">
            {onBack && (
                <button onClick={onBack} className="text-gray-500 hover:text-white transition-colors">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
            )}
            <div>
                <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-400">Workflow & Tools</h1>
                <p className="text-gray-400 text-xs mt-1">Manage pipelines and scripts</p>
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={() => handleCreate('TOOL')} className="bg-orange-600 hover:bg-orange-500 text-white px-4 py-2 rounded-lg font-medium shadow-lg shadow-orange-900/20 text-sm">+ Tool</button>
            <button onClick={() => handleCreate('PIPELINE')} className="bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded-lg font-medium shadow-lg shadow-purple-900/20 text-sm">+ Workflow</button>
          </div>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto p-8">
        <div className="space-y-12">
          {Object.entries(groupedWorkflows).map(([category, items]) => (
            <div key={category}>
              <h2 className="text-lg font-bold text-gray-300 mb-6 flex items-center gap-3">
                <span className="w-2 h-2 bg-purple-500 rounded-full shadow-[0_0_10px_rgba(168,85,247,0.5)]"></span>
                {category}
              </h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                {items.map(wf => (
                  <div key={wf.id} className="bg-gray-900 border border-gray-800 rounded-xl p-5 hover:border-purple-500/30 hover:bg-gray-800/50 transition-all group relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-3">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                            wf.workflow_type === 'MODULE' ? 'text-blue-400 border-blue-900 bg-blue-900/10' : 
                            wf.workflow_type === 'TOOL' ? 'text-orange-400 border-orange-900 bg-orange-900/10' : 'text-emerald-400 border-emerald-900 bg-emerald-900/10'
                        }`}>{wf.workflow_type}</span>
                    </div>
                    <h3 className="font-bold text-base mb-1 text-gray-100">{wf.name}</h3>
                    <p className="text-gray-500 text-xs mb-4 line-clamp-2 h-8">{wf.description || "No description."}</p>
                    <div className="flex justify-between items-end border-t border-gray-800/50 pt-3">
                        <div className="text-[10px] text-gray-600 font-mono">{new Date(wf.updated_at).toLocaleDateString()}</div>
                        <div className="flex gap-2">
                            <button onClick={() => handleEdit(wf)} className="text-gray-400 hover:text-white"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg></button>
                            <button onClick={() => handleDeleteClick(wf)} className="text-gray-600 hover:text-red-400"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                        </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {isEditorOpen && <WorkflowEditorModal initialData={editingWorkflow} defaultType={createType} onClose={() => setIsEditorOpen(false)} onSave={fetchWorkflows} />}
      <ConfirmModal isOpen={confirmModal.isOpen} title={confirmModal.title} message={confirmModal.message} onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))} onConfirm={confirmModal.action} />
    </div>
  );
}