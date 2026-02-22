'use client';

import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import UploadModal from '@/components/UploadModal';
import SampleManager from '@/components/SampleManager';
import AnalysisManager from '@/components/AnalysisManager';
import CopilotPanel from '@/components/CopilotPanel'; 
import ConfirmModal from '@/components/ConfirmModal';
import InputModal from '@/components/InputModal';
import toast from 'react-hot-toast';

interface FileData { id: string; filename: string; size: number; uploaded_at: string; content_type: string; is_directory: boolean; }
interface ProjectDetail { id: string; name: string; description: string; }
interface Breadcrumb { id: string; name: string; }

const fetchAPI = async (endpoint: string) => {
    const token = localStorage.getItem('token');
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}${endpoint}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`API error: ${endpoint}`);
    return res.json();
};

function LinkProjectModal({ fileId, currentProjectId, onClose }: any) {
  const queryClient = useQueryClient();
  const [selectedProjectId, setSelectedProjectId] = useState('');

  const { data: projects = [] } = useQuery<ProjectDetail[]>({
    queryKey: ['projects'],
    queryFn: () => fetchAPI('/files/projects'),
  });
  
  const availableProjects = projects.filter(p => p.id !== currentProjectId);

  useEffect(() => {
      if (availableProjects.length > 0 && !selectedProjectId) setSelectedProjectId(availableProjects[0].id);
  }, [availableProjects, selectedProjectId]);

  const linkMutation = useMutation({
      mutationFn: async () => {
          const token = localStorage.getItem('token');
          const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/files/files/${fileId}/link`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
              body: JSON.stringify({ target_project_id: selectedProjectId })
          });
          if (!res.ok) throw await res.json();
          return res.json();
      },
      onSuccess: () => {
          toast.success('Linked successfully!');
          queryClient.invalidateQueries({ queryKey: ['files'] });
          onClose();
      },
      onError: (err: any) => toast.error(err.status === 'already_linked' ? 'Already linked' : `Failed: ${err.detail || 'Network error'}`)
  });

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[200]">
      <div className="bg-gray-900 p-6 rounded-xl border border-gray-700 w-96 shadow-2xl">
        <h3 className="text-xl font-bold text-white mb-4">Share to another Project</h3>
        {availableProjects.length === 0 ? <div className="text-yellow-500 text-sm mb-4">No other projects available.</div> : (
          <select className="w-full bg-gray-800 border border-gray-700 rounded-md p-2 text-white mb-6 outline-none focus:border-blue-500" value={selectedProjectId} onChange={(e) => setSelectedProjectId(e.target.value)}>
            {availableProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="text-gray-400 hover:text-white text-sm">Cancel</button>
          <button onClick={() => linkMutation.mutate()} disabled={linkMutation.isPending || availableProjects.length === 0} className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm disabled:opacity-50 transition-colors">
              {linkMutation.isPending ? 'Linking...' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}

interface ProjectWorkspaceProps { projectId: string; onBack?: () => void; isActive?: boolean; }

export default function ProjectWorkspace({ projectId, onBack, isActive = true }: ProjectWorkspaceProps) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'files' | 'samples' | 'workflow' | 'copilot'>('files');
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  
  const [showUpload, setShowUpload] = useState(false);
  const [linkTargetFileId, setLinkTargetFileId] = useState<string | null>(null);
  const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean; title: string; message: string; action: () => void }>({ isOpen: false, title: '', message: '', action: () => {} });
  const [inputModal, setInputModal] = useState<{ isOpen: boolean; title: string; defaultValue: string; onSubmit: (val: string) => void }>({ isOpen: false, title: '', defaultValue: '', onSubmit: () => {} });

  const { data: project } = useQuery<ProjectDetail>({
      queryKey: ['project', projectId],
      queryFn: () => fetchAPI(`/files/projects/${projectId}`),
      enabled: isActive
  });

  const { data: filesData, isLoading: filesLoading } = useQuery({
      queryKey: ['files', projectId, currentFolderId],
      queryFn: () => fetchAPI(`/files/projects/${projectId}/files${currentFolderId ? `?folder_id=${currentFolderId}` : ''}`),
      enabled: isActive && activeTab === 'files'
  });

  const files: FileData[] = filesData?.files || [];
  const breadcrumbs: Breadcrumb[] = filesData?.breadcrumbs || [];

  const parentRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: files.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 56,
    overscan: 5,
  });

  const actionMutation = useMutation({
      mutationFn: async ({ url, method, body }: { url: string, method: string, body?: any }) => {
          const token = localStorage.getItem('token');
          const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}${url}`, {
              method,
              headers: { 'Authorization': `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
              body: body ? JSON.stringify(body) : undefined
          });
          if (!res.ok) { const err = await res.json(); throw new Error(err.detail || 'Request failed'); }
          return res.json();
      },
      onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ['files', projectId] });
      },
      onError: (err: Error) => toast.error(err.message)
  });

  const handleDownload = async (fileId: string) => {
    const loadingToast = toast.loading("Preparing download...");
    try {
      const data = await fetchAPI(`/files/files/${fileId}/download`);
      const baseUrl = (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/api\/v1\/?$/, '');
      window.open(`${baseUrl}${data.download_url}`, '_blank');
      toast.dismiss(loadingToast);
    } catch (e) { toast.error('Request failed', { id: loadingToast }); }
  };

  const openCreateFolderModal = () => setInputModal({ isOpen: true, title: "New Folder Name", defaultValue: "", onSubmit: (name) => {
      actionMutation.mutate({ url: `/files/projects/${projectId}/folders?folder_name=${encodeURIComponent(name)}${currentFolderId ? `&parent_id=${currentFolderId}` : ''}`, method: 'POST' });
      toast.success("Folder created");
  }});
  
  const openRenameModal = (fileId: string, currentName: string) => setInputModal({ isOpen: true, title: "Rename File/Folder", defaultValue: currentName, onSubmit: (newName) => {
      actionMutation.mutate({ url: `/files/files/${fileId}/rename`, method: 'PATCH', body: { new_name: newName } });
      toast.success("Renamed");
  }});

  const openRemoveLinkModal = (fileId: string) => setConfirmModal({ isOpen: true, title: "Remove from Project", message: "Remove file from this project view? (File remains in storage)", action: () => {
      actionMutation.mutate({ url: `/files/projects/${projectId}/files/${fileId}`, method: 'DELETE' });
      toast.success("Removed from project");
  }});

  const openHardDeleteModal = (fileId: string, isDir: boolean) => setConfirmModal({ isOpen: true, title: isDir ? "Delete Folder" : "Delete File", message: isDir ? "⚠️ Permanently delete this folder? Ensure it is empty." : "⚠️ Permanently delete this file! Cannot be undone!", action: () => {
      actionMutation.mutate({ url: `/files/files/${fileId}`, method: 'DELETE' });
      toast.success('Permanently deleted');
  }});

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '-';
    const k = 1024; const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="h-full flex flex-col bg-gray-950 text-white overflow-hidden">
      <div className="px-8 py-6 border-b border-gray-800 bg-gray-900/30 flex-shrink-0">
        <div className="flex justify-between items-end">
          <div>
            <div className="flex items-center gap-2 mb-2">
                {onBack && (
                    <button onClick={onBack} className="text-gray-500 hover:text-white transition-colors p-1 rounded hover:bg-gray-800" title="Close Tab">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                )}
                <h2 className="text-2xl font-bold">{project?.name || 'Loading...'}</h2>
            </div>
            
            <div className="flex gap-6 mt-4">
                {['files', 'samples', 'workflow', 'copilot'].map((tab) => (
                    <button 
                      key={tab} 
                      onClick={() => setActiveTab(tab as any)} 
                      className={`pb-2 text-sm font-medium transition-colors border-b-2 capitalize ${activeTab === tab ? 'border-blue-500 text-white' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
                    >
                        {tab === 'copilot' ? '✨ Bio-Copilot' : tab}
                    </button>
                ))}
            </div>
          </div>
          
          {activeTab === 'files' && (
             <div className="flex gap-3 mb-2">
                <button onClick={openCreateFolderModal} className="bg-gray-800 hover:bg-gray-700 text-white px-3 py-1.5 rounded border border-gray-700 text-xs transition-colors shadow-sm">+ New Folder</button>
                <button onClick={() => setShowUpload(true)} className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded shadow-lg shadow-blue-900/20 text-xs transition-colors">+ Upload Data</button>
             </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-hidden relative p-8 flex flex-col">
        {activeTab === 'files' && (
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 flex-1 flex flex-col overflow-hidden">
                <div className="flex items-center gap-2 text-sm text-gray-400 mb-4 bg-gray-900/50 p-3 rounded-lg border border-gray-800 shadow-sm flex-shrink-0">
                    <span className={`cursor-pointer hover:text-white hover:underline transition-colors ${!currentFolderId ? 'font-bold text-white' : ''}`} onClick={() => setCurrentFolderId(null)}>Root</span>
                    {breadcrumbs.map((b) => (
                        <div key={b.id} className="flex items-center gap-2">
                        <span>/</span>
                        <span className={`cursor-pointer hover:text-white hover:underline transition-colors ${currentFolderId === b.id ? 'font-bold text-white' : ''}`} onClick={() => setCurrentFolderId(b.id)}>{b.name}</span>
                        </div>
                    ))}
                </div>

                <div className="bg-gray-900 border border-gray-800 rounded-xl shadow-xl flex-1 flex flex-col overflow-hidden">
                    <div className="flex bg-gray-800/50 text-gray-400 text-xs uppercase tracking-wider px-6 py-4 font-medium border-b border-gray-800">
                        <div className="flex-1">Name</div>
                        <div className="w-24">Size</div>
                        <div className="w-24">Type</div>
                        <div className="w-32">Date</div>
                        <div className="w-32 text-right">Actions</div>
                    </div>
                    
                    <div ref={parentRef} className="flex-1 overflow-auto relative">
                        {filesLoading && (
                            <div className="absolute inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-10">
                                <span className="text-gray-400 animate-pulse font-medium">Loading files...</span>
                            </div>
                        )}
                        {!filesLoading && files.length === 0 && <div className="p-12 text-center text-gray-500">Folder is empty</div>}
                        
                        <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, width: '100%', position: 'relative' }}>
                            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                                const file = files[virtualRow.index];
                                return (
                                    <div 
                                        key={file.id}
                                        style={{
                                            position: 'absolute',
                                            top: 0,
                                            left: 0,
                                            width: '100%',
                                            height: `${virtualRow.size}px`,
                                            transform: `translateY(${virtualRow.start}px)`,
                                        }}
                                        className="flex items-center px-6 border-b border-gray-800/50 hover:bg-gray-800/50 transition-colors group"
                                    >
                                        <div className="flex-1 font-medium text-white flex items-center gap-3">
                                            <div className={`flex items-center gap-3 ${file.is_directory ? 'cursor-pointer' : ''}`} onClick={() => file.is_directory && setCurrentFolderId(file.id)}>
                                                {file.is_directory ? <svg className="w-6 h-6 text-yellow-500" fill="currentColor" viewBox="0 0 20 20"><path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" /></svg> : <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>}
                                                <span className={`${file.is_directory ? 'font-bold text-yellow-500 hover:underline' : ''} truncate max-w-xs block`}>{file.filename}</span>
                                            </div>
                                        </div>
                                        <div className="w-24 text-gray-400 text-sm font-mono">{formatSize(file.size)}</div>
                                        <div className="w-24 text-gray-500 text-xs uppercase">{file.is_directory ? 'Folder' : file.content_type.split('/')[1] || 'File'}</div>
                                        <div className="w-32 text-gray-500 text-sm">{new Date(file.uploaded_at).toLocaleDateString()}</div>
                                        <div className="w-32 text-right opacity-0 group-hover:opacity-100 transition-opacity flex justify-end gap-2">
                                            {!file.is_directory && <button onClick={() => handleDownload(file.id)} className="text-blue-400 hover:text-blue-300 p-1 bg-blue-900/20 rounded" title="Download"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg></button>}
                                            <button onClick={() => setLinkTargetFileId(file.id)} className="text-emerald-400 hover:text-emerald-300 p-1 bg-emerald-900/20 rounded" title="Share"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg></button>
                                            <button onClick={() => openRenameModal(file.id, file.filename)} className="text-yellow-400 hover:text-yellow-300 p-1 bg-yellow-900/20 rounded" title="Rename"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg></button>
                                            <button onClick={() => openRemoveLinkModal(file.id)} className="text-gray-400 hover:text-white p-1 bg-gray-800 rounded" title="Unlink"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg></button>
                                            <button onClick={() => openHardDeleteModal(file.id, file.is_directory)} className="text-red-500 hover:text-red-400 p-1 bg-red-900/20 rounded" title="Delete"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>
        )}

        {activeTab === 'samples' && <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 h-full"><SampleManager projectId={projectId} /></div>}
        {activeTab === 'workflow' && <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 h-full"><AnalysisManager projectId={projectId} isActive={isActive && activeTab === 'workflow'} /></div>}
        {activeTab === 'copilot' && <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 h-full"><CopilotPanel projectId={projectId} /></div>}
      </div>

      {showUpload && <UploadModal projectId={projectId} currentFolderId={currentFolderId} onClose={() => setShowUpload(false)} onUploadSuccess={() => queryClient.invalidateQueries({ queryKey: ['files', projectId] })} />}
      {linkTargetFileId && <LinkProjectModal fileId={linkTargetFileId} currentProjectId={projectId} onClose={() => setLinkTargetFileId(null)} />}
      <ConfirmModal isOpen={confirmModal.isOpen} title={confirmModal.title} message={confirmModal.message} onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))} onConfirm={() => { confirmModal.action(); setConfirmModal(prev => ({ ...prev, isOpen: false })); }} />
      <InputModal isOpen={inputModal.isOpen} title={inputModal.title} defaultValue={inputModal.defaultValue} onClose={() => setInputModal(prev => ({ ...prev, isOpen: false }))} onSubmit={(val) => { inputModal.onSubmit(val); setInputModal(prev => ({ ...prev, isOpen: false })); }} />
    </div>
  );
}