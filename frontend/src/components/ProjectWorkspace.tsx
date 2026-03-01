'use client';

import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import UploadModal from '@/components/UploadModal';
import SampleManager from '@/components/SampleManager';
import AnalysisManager from '@/components/AnalysisManager';
import ConfirmModal from '@/components/ConfirmModal';
import InputModal from '@/components/InputModal';
import { toast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/Card';
import { AnimatedTabsUnderline } from '@/components/ui/animated-tabs';
import { 
  X, Folder, FileText, Download, Share2, Pencil, Link2Off, Trash2, 
  FolderPlus, Upload, ChevronRight, Maximize2, Minimize2
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface FileData { id: string; filename: string; size: number; uploaded_at: string; content_type: string; is_directory: boolean; }
interface ProjectDetail { id: string; name: string; description: string; }
interface Breadcrumb { id: string; name: string; }

const fetchAPI = async (endpoint: string) => {
    const token = localStorage.getItem('token');
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}${endpoint}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`API error: ${endpoint}`);
    return res.json();
};

interface LinkProjectModalProps {
  fileId: string;
  currentProjectId: string;
  onClose: () => void;
}

function LinkProjectModal({ fileId, currentProjectId, onClose }: LinkProjectModalProps) {
  const queryClient = useQueryClient();
  
  const { data: projects = [] } = useQuery<ProjectDetail[]>({
    queryKey: ['projects'],
    queryFn: () => fetchAPI('/files/projects'),
  });
  
  const availableProjects = projects.filter(p => p.id !== currentProjectId);
  const firstProjectId = availableProjects[0]?.id || '';
  const [selectedProjectId, setSelectedProjectId] = useState(firstProjectId);

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
      onError: (err: { status?: string; detail?: string }) => toast.error(err.status === 'already_linked' ? 'Already linked' : `Failed: ${err.detail || 'Network error'}`)
  });

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[200]">
      <Card className="w-full max-w-md mx-4">
        <CardContent className="p-6">
          <h3 className="text-lg font-bold mb-4">Share to another Project</h3>
          {availableProjects.length === 0 ? (
            <div className="text-yellow-500 text-sm mb-4">No other projects available.</div>
          ) : (
            <select 
              className="w-full bg-background border border-input rounded-md p-3 mb-6 outline-none focus:border-primary"
              value={selectedProjectId} 
              onChange={(e) => setSelectedProjectId(e.target.value)}
            >
              {availableProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button 
              onClick={() => linkMutation.mutate()} 
              disabled={linkMutation.isPending || availableProjects.length === 0}
            >
              {linkMutation.isPending ? 'Linking...' : 'Confirm'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

interface ProjectWorkspaceProps { projectId: string; onBack?: () => void; isActive?: boolean; }

export default function ProjectWorkspace({ projectId, onBack, isActive = true }: ProjectWorkspaceProps) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'files' | 'samples' | 'workflow'>('files');
  const [fullscreen, setFullscreen] = useState(false);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [batchMode, setBatchMode] = useState(false);
  
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
      mutationFn: async ({ url, method, body }: { url: string; method: string; body?: unknown }) => {
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
    } catch { toast.error('Request failed', { id: loadingToast }); }
  };

  const toggleFileSelection = (fileId: string) => {
    setSelectedFiles(prev => {
      const newSet = new Set(prev);
      if (newSet.has(fileId)) {
        newSet.delete(fileId);
      } else {
        newSet.add(fileId);
      }
      return newSet;
    });
  };

  const toggleSelectAll = () => {
    if (selectedFiles.size === files.length) {
      setSelectedFiles(new Set());
    } else {
      setSelectedFiles(new Set(files.map(f => f.id)));
    }
  };

  const handleBatchDelete = () => {
    if (selectedFiles.size === 0) return;
    setConfirmModal({
      isOpen: true,
      title: "Delete Selected Files",
      message: `Are you sure you want to permanently delete ${selectedFiles.size} selected item(s)? This action cannot be undone.`,
      action: async () => {
        const deletePromises = Array.from(selectedFiles).map(id => 
          fetch(`${process.env.NEXT_PUBLIC_API_URL}/files/files/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
          })
        );
        await Promise.all(deletePromises);
        toast.success(`${selectedFiles.size} files deleted`);
        setSelectedFiles(new Set());
        setBatchMode(false);
        queryClient.invalidateQueries({ queryKey: ['files', projectId] });
      }
    });
  };

  const handleBatchDownload = async () => {
    if (selectedFiles.size === 0) return;
    const loadingToast = toast.loading(`Preparing ${selectedFiles.size} files for download...`);
    try {
      const filesToDownload = files.filter(f => selectedFiles.has(f.id) && !f.is_directory);
      for (const file of filesToDownload) {
        await handleDownload(file.id);
      }
      toast.dismiss(loadingToast);
      toast.success(`Download started for ${filesToDownload.length} files`);
    } catch {
      toast.error('Download failed', { id: loadingToast });
    }
  };

  const openCreateFolderModal = () => setInputModal({ 
    isOpen: true, 
    title: "New Folder", 
    defaultValue: "", 
    onSubmit: (name) => {
      actionMutation.mutate({ 
        url: `/files/projects/${projectId}/folders?folder_name=${encodeURIComponent(name)}${currentFolderId ? `&parent_id=${currentFolderId}` : ''}`, 
        method: 'POST' 
      });
      toast.success("Folder created");
    }
  });
  
  const openRenameModal = (fileId: string, currentName: string) => setInputModal({ 
    isOpen: true, 
    title: "Rename", 
    defaultValue: currentName, 
    onSubmit: (newName) => {
      actionMutation.mutate({ url: `/files/files/${fileId}/rename`, method: 'PATCH', body: { new_name: newName } });
      toast.success("Renamed");
    }
  });

  const openRemoveLinkModal = (fileId: string) => setConfirmModal({ 
    isOpen: true, 
    title: "Remove from Project", 
    message: "Remove file from this project view? (File remains in storage)", 
    action: () => {
      actionMutation.mutate({ url: `/files/projects/${projectId}/files/${fileId}`, method: 'DELETE' });
      toast.success("Removed from project");
    }
  });

  const openHardDeleteModal = (fileId: string, isDir: boolean) => setConfirmModal({ 
    isOpen: true, 
    title: isDir ? "Delete Folder" : "Delete File", 
    message: isDir ? "Permanently delete this folder?" : "Permanently delete this file! Cannot be undone!", 
    action: () => {
      actionMutation.mutate({ url: `/files/files/${fileId}`, method: 'DELETE' });
      toast.success('Permanently deleted');
    }
  });

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '-';
    const k = 1024; const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const tabs = [
    { id: 'files', label: 'Files' },
    { id: 'samples', label: 'Samples' },
    { id: 'workflow', label: 'Workflow' },
  ];

  const displayTabs = tabs;

  return (
    <div className="h-full flex flex-col bg-background text-foreground overflow-hidden">
      {/* Header */}
      <div className="px-3 md:px-6 py-3 md:py-5 border-b border-border bg-card/50 flex-shrink-0">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-2 md:gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1 md:mb-2">
                {onBack && (
                    <Button variant="ghost" size="icon-sm" className="touch-target-min" onClick={onBack}>
                        <X className="w-4 h-4" />
                    </Button>
                )}
                <h2 className="text-lg md:text-xl font-bold truncate">{project?.name || 'Loading...'}</h2>
            </div>
            
            <AnimatedTabsUnderline
              tabs={displayTabs.map(t => ({ id: t.id, label: t.label }))}
              activeTab={activeTab}
              onChange={(id) => setActiveTab(id as typeof activeTab)}
              className="mt-2 md:mt-3"
            />
          </div>
          
          {activeTab === 'files' && (
             <div className="flex gap-2 w-full sm:w-auto">
                <Button variant="outline" size="sm" onClick={openCreateFolderModal} className="gap-1.5 md:gap-2 flex-1 sm:flex-none text-xs md:text-sm">
                  <FolderPlus className="w-3.5 md:w-4 h-3.5 md:h-4" />
                  <span className="hidden sm:inline">New Folder</span>
                </Button>
                <Button size="sm" onClick={() => setShowUpload(true)} className="gap-1.5 md:gap-2 flex-1 sm:flex-none text-xs md:text-sm">
                  <Upload className="w-3.5 md:w-4 h-3.5 md:h-4" />
                  <span className="hidden sm:inline">Upload</span>
                </Button>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => setFullscreen(!fullscreen)}
                  className="touch-target-min"
                  title={fullscreen ? "Exit fullscreen" : "Fullscreen"}
                >
                  {fullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </Button>
             </div>
          )}

          {activeTab !== 'files' && (
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => setFullscreen(!fullscreen)}
              className="touch-target-min"
              title={fullscreen ? "Exit fullscreen" : "Fullscreen"}
            >
              {fullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </Button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className={cn(
        "flex-1 overflow-hidden relative flex flex-col",
        fullscreen ? "fixed inset-0 z-50 bg-background pt-12" : "p-3 md:p-6"
      )}>
        {/* Fullscreen exit button */}
        {fullscreen && (
          <div className="absolute top-2 right-2 z-10 flex gap-2">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => setFullscreen(false)}
              className="touch-target-min bg-card/80 backdrop-blur-sm"
            >
              <Minimize2 className="w-4 h-4 mr-1" />
              Exit Fullscreen
            </Button>
          </div>
        )}
        
        {activeTab === 'files' && (
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 flex-1 flex flex-col overflow-hidden">
                {/* Breadcrumbs */}
                <div className="flex items-center gap-1.5 md:gap-2 text-xs md:text-sm bg-card border border-border rounded-lg px-3 md:px-4 py-2 md:py-3 mb-3 md:mb-4 flex-shrink-0 overflow-x-auto scrollbar-hide">
                    <span 
                      className={cn(
                        "cursor-pointer hover:text-primary hover:underline transition-colors font-medium whitespace-nowrap",
                        !currentFolderId ? "text-primary" : "text-muted-foreground"
                      )} 
                      onClick={() => setCurrentFolderId(null)}
                    >
                      Root
                    </span>
                    {breadcrumbs.map((b) => (
                        <div key={b.id} className="flex items-center gap-1.5 md:gap-2">
                        <ChevronRight className="w-3 md:w-4 h-3 md:h-4 text-muted-foreground flex-shrink-0" />
                        <span 
                          className={cn(
                            "cursor-pointer hover:text-primary hover:underline transition-colors whitespace-nowrap",
                            currentFolderId === b.id ? "text-primary font-medium" : "text-muted-foreground"
                          )} 
                          onClick={() => setCurrentFolderId(b.id)}
                        >
                          {b.name}
                        </span>
                        </div>
                    ))}
                </div>

                {/* Batch Action Bar */}
                {selectedFiles.size > 0 && (
                  <div className="flex items-center gap-2 mb-3 p-2 bg-primary/10 border border-primary/30 rounded-lg flex-shrink-0">
                    <span className="text-sm text-primary font-medium">
                      {selectedFiles.size} selected
                    </span>
                    <div className="flex gap-2 ml-auto">
                      <Button 
                        size="sm" 
                        variant="outline" 
                        onClick={handleBatchDownload}
                        className="gap-1.5"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Download
                      </Button>
                      <Button 
                        size="sm" 
                        variant="destructive" 
                        onClick={handleBatchDelete}
                        className="gap-1.5"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Delete
                      </Button>
                      <Button 
                        size="sm" 
                        variant="ghost" 
                        onClick={() => { setSelectedFiles(new Set()); setBatchMode(false); }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}

                {/* File List */}
                <Card className="flex-1 flex flex-col overflow-hidden">
                    <div className="flex bg-muted/50 text-muted-foreground text-xs uppercase tracking-wider px-3 md:px-6 py-2 md:py-3 font-medium border-b items-center">
                        <div className="w-8 flex-shrink-0">
                          <input 
                            type="checkbox" 
                            checked={files.length > 0 && selectedFiles.size === files.length}
                            onChange={toggleSelectAll}
                            className="w-4 h-4 rounded border-input accent-primary cursor-pointer"
                          />
                        </div>
                        <div className="flex-1 min-w-0">Name</div>
                        <div className="w-16 md:w-24 hidden sm:block">Size</div>
                        <div className="w-20 md:w-24 hidden sm:block">Type</div>
                        <div className="w-20 md:w-32 hidden md:block">Date</div>
                        <div className="w-16 md:w-32 text-right hidden md:block">Actions</div>
                    </div>
                    
                    <div ref={parentRef} className="flex-1 overflow-auto relative">
                        {filesLoading && (
                            <div className="absolute inset-0 bg-card/50 backdrop-blur-sm flex items-center justify-center z-10">
                                <span className="text-muted-foreground animate-pulse font-medium">Loading files...</span>
                            </div>
                        )}
                        {!filesLoading && files.length === 0 && (
                          <div className="p-8 md:p-12 text-center text-muted-foreground">
                            <Folder className="w-10 md:w-12 h-10 md:h-12 mx-auto mb-2 md:3 opacity-30" />
                            <p className="text-sm md:text-base">Folder is empty</p>
                          </div>
                        )}
                        
                        <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, width: '100%', position: 'relative' }}>
                            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                                const file = files[virtualRow.index];
                                const isSelected = selectedFiles.has(file.id);
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
                                        className={cn(
                                          "flex items-center px-3 md:px-6 border-b border-border/50 transition-colors group",
                                          isSelected ? "bg-primary/5" : "hover:bg-muted/50"
                                        )}
                                    >
                                        <div className="w-8 flex-shrink-0">
                                          <input 
                                            type="checkbox" 
                                            checked={isSelected}
                                            onChange={() => toggleFileSelection(file.id)}
                                            className="w-4 h-4 rounded border-input accent-primary cursor-pointer"
                                          />
                                        </div>
                                        <div className="flex-1 font-medium flex items-center gap-2 md:gap-3 min-w-0">
                                            <div className={cn("flex items-center gap-2 md:gap-3", file.is_directory ? 'cursor-pointer' : '')} onClick={() => file.is_directory && setCurrentFolderId(file.id)}>
                                                {file.is_directory ? <Folder className="w-5 md:w-6 h-5 md:h-6 text-yellow-500 flex-shrink-0" /> : <FileText className="w-4 md:w-5 h-4 md:h-5 text-blue-400 flex-shrink-0" />}
                                                <span className={cn("truncate text-sm md:text-base", file.is_directory ? "font-bold text-yellow-500 hover:underline" : "")}>{file.filename}</span>
                                            </div>
                                        </div>
                                        <div className="w-16 md:w-24 text-muted-foreground text-xs md:text-sm font-mono hidden sm:block">{formatSize(file.size)}</div>
                                        <div className="w-20 md:w-24 text-muted-foreground text-xs uppercase hidden sm:block">{file.is_directory ? 'Folder' : file.content_type.split('/')[1] || 'File'}</div>
                                        <div className="w-20 md:w-32 text-muted-foreground text-xs md:text-sm hidden md:block">{new Date(file.uploaded_at).toLocaleDateString()}</div>
                                        <div className="w-16 md:w-32 text-right flex justify-end gap-0.5 md:gap-1">
                                            {!file.is_directory && (
                                              <Button variant="ghost" size="icon-sm" className="touch-target-min" onClick={() => handleDownload(file.id)} title="Download" aria-label="Download file">
                                                <Download className="w-3.5 md:w-4 h-3.5 md:h-4" />
                                              </Button>
                                            )}
                                            <Button variant="ghost" size="icon-sm" className="touch-target-min" onClick={() => setLinkTargetFileId(file.id)} title="Share" aria-label="Share to another project">
                                                <Share2 className="w-3.5 md:w-4 h-3.5 md:h-4" />
                                            </Button>
                                            <Button variant="ghost" size="icon-sm" className="touch-target-min hidden sm:flex" onClick={() => openRenameModal(file.id, file.filename)} title="Rename" aria-label="Rename file">
                                                <Pencil className="w-3.5 md:w-4 h-3.5 md:h-4" />
                                            </Button>
                                            <Button variant="ghost" size="icon-sm" className="touch-target-min" onClick={() => openRemoveLinkModal(file.id)} title="Unlink" aria-label="Remove from project">
                                                <Link2Off className="w-3.5 md:w-4 h-3.5 md:h-4" />
                                            </Button>
                                            <Button variant="ghost" size="icon-sm" className="touch-target-min text-destructive hover:text-destructive" onClick={() => openHardDeleteModal(file.id, file.is_directory)} title="Delete" aria-label="Delete permanently">
                                                <Trash2 className="w-3.5 md:w-4 h-3.5 md:h-4" />
                                            </Button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </Card>
            </div>
        )}

        {activeTab === 'samples' && (
          <div className={cn(
            "animate-in fade-in slide-in-from-bottom-2 duration-300 flex-1",
            fullscreen ? "h-full" : ""
          )}>
            <SampleManager projectId={projectId} />
          </div>
        )}
        {activeTab === 'workflow' && (
          <div className={cn(
            "animate-in fade-in slide-in-from-bottom-2 duration-300 flex-1",
            fullscreen ? "h-full" : ""
          )}>
            <AnalysisManager projectId={projectId} isActive={isActive && activeTab === 'workflow'} />
          </div>
        )}
      </div>

      {showUpload && <UploadModal projectId={projectId} currentFolderId={currentFolderId} onClose={() => setShowUpload(false)} onUploadSuccess={() => queryClient.invalidateQueries({ queryKey: ['files', projectId] })} />}
      {linkTargetFileId && <LinkProjectModal fileId={linkTargetFileId} currentProjectId={projectId} onClose={() => setLinkTargetFileId(null)} />}
      <ConfirmModal 
        isOpen={confirmModal.isOpen} 
        title={confirmModal.title} 
        message={confirmModal.message} 
        onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))} 
        onConfirm={() => { confirmModal.action(); setConfirmModal(prev => ({ ...prev, isOpen: false })); }} 
      />
      <InputModal 
        isOpen={inputModal.isOpen} 
        title={inputModal.title} 
        defaultValue={inputModal.defaultValue} 
        onClose={() => setInputModal(prev => ({ ...prev, isOpen: false }))} 
        onSubmit={(val) => { inputModal.onSubmit(val); setInputModal(prev => ({ ...prev, isOpen: false })); }} 
      />
    </div>
  );
}
