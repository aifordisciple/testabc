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
  script_path: string;
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

  const handleCreate = () => {
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
              Workflow Management
            </h1>
            <p className="text-gray-400 mt-2 text-sm">
              Configure analysis pipelines, tools, and their parameters.
            </p>
          </div>
          <div className="flex gap-3">
            <button 
                onClick={() => router.push('/dashboard')}
                className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
            >
                &larr; Back to Dashboard
            </button>
            <button 
              onClick={handleCreate}
              className="bg-purple-600 hover:bg-purple-500 text-white px-6 py-2 rounded-lg font-medium transition-all shadow-lg shadow-purple-900/20"
            >
              + Create Workflow
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="space-y-8">
          {Object.entries(groupedWorkflows).map(([category, items]) => (
            <div key={category}>
              <h2 className="text-xl font-bold text-gray-300 mb-4 flex items-center gap-2">
                <span className="w-2 h-2 bg-purple-500 rounded-full"></span>
                {category}
              </h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                {items.map(wf => (
                  <div key={wf.id} className="bg-gray-900 border border-gray-800 rounded-xl p-5 hover:border-gray-700 transition-all group">
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-xs font-mono text-purple-400 bg-purple-900/20 px-2 py-1 rounded">
                        {wf.subcategory || 'General'}
                      </span>
                      <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={() => handleEdit(wf)}
                          className="text-gray-400 hover:text-blue-400"
                          title="Edit"
                        >
                          ✎
                        </button>
                        <button 
                          onClick={() => handleDeleteClick(wf)}
                          className="text-gray-400 hover:text-red-400"
                          title="Delete"
                        >
                          🗑
                        </button>
                      </div>
                    </div>
                    
                    <h3 className="font-bold text-lg mb-1">{wf.name}</h3>
                    <p className="text-gray-500 text-sm mb-4 line-clamp-2 h-10">
                      {wf.description || "No description provided."}
                    </p>
                    
                    <div className="text-xs text-gray-600 font-mono flex flex-col gap-1">
                      <div>Script: {wf.script_path}</div>
                      <div>Updated: {new Date(wf.updated_at).toLocaleDateString()}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          
          {workflows.length === 0 && (
             <div className="text-center py-20 text-gray-600">No workflows found.</div>
          )}
        </div>
      </div>

      {/* Modals */}
      {isEditorOpen && (
        <WorkflowEditorModal 
          initialData={editingWorkflow}
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