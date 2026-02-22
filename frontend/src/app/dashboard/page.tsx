'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import CreateProjectModal from '@/components/CreateProjectModal';
import UploadModal from '@/components/UploadModal';
import ProjectWorkspace from '@/components/ProjectWorkspace';
import WorkflowManager from '@/components/WorkflowManager';
import KnowledgeBase from '@/components/KnowledgeBase'; // 👈 引入知识库组件
import toast from 'react-hot-toast';

// --- 类型定义 ---
interface Project { id: string; name: string; description: string; created_at: string; }
interface Tab { key: string; label: string; type: 'dashboard' | 'project' | 'workflow' | 'knowledge'; data?: any; }

const NAV_ITEMS = [
  { id: 'projects', label: 'Projects', icon: (<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>) },
  { id: 'workflows', label: 'Workflows', icon: (<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>) },
  // 👇 新增知识库入口图标
  { id: 'knowledge', label: 'Knowledge Base', icon: (<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" /></svg>) },
];

export default function Dashboard() {
  const router = useRouter();
  const queryClient = useQueryClient();
  
  const [tabs, setTabs] = useState<Tab[]>([{ key: 'dashboard', label: 'Dashboard', type: 'dashboard' }]);
  const [activeTabKey, setActiveTabKey] = useState('dashboard');
  const [searchQuery, setSearchQuery] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  
  const [showCreate, setShowCreate] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [activeProjectId, setActiveProjectId] = useState('');
  const [isRenaming, setIsRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const { data: projects = [], isLoading } = useQuery<Project[]>({
    queryKey: ['projects'],
    queryFn: async () => {
      const token = localStorage.getItem('token');
      if (!token) { router.push('/'); return []; }
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/files/projects`, { 
        headers: { 'Authorization': `Bearer ${token}` } 
      });
      if (res.status === 401) router.push('/');
      if (!res.ok) throw new Error('Failed to fetch projects');
      return res.json();
    }
  });

  const deleteProjectMutation = useMutation({
    mutationFn: async (projectId: string) => {
        const token = localStorage.getItem('token');
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/files/projects/${projectId}`, { 
            method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } 
        });
        if (!res.ok) throw new Error('Delete failed');
    },
    onSuccess: (_, projectId) => {
        toast.success("Project deleted");
        queryClient.invalidateQueries({ queryKey: ['projects'] });
        closeTab(`project-${projectId}`);
    }
  });

  const renameProjectMutation = useMutation({
    mutationFn: async ({ id, name }: { id: string, name: string }) => {
        const token = localStorage.getItem('token');
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/files/projects/${id}`, { 
            method: 'PATCH', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify({ name }) 
        });
        if (!res.ok) throw new Error('Rename failed');
    },
    onSuccess: (_, { id, name }) => {
        toast.success("Renamed successfully");
        setIsRenaming(null);
        queryClient.invalidateQueries({ queryKey: ['projects'] });
        setTabs(prev => prev.map(t => t.key === `project-${id}` ? { ...t, label: name } : t));
    }
  });

  const openProjectTab = (project: Project) => {
    const key = `project-${project.id}`;
    if (!tabs.find(t => t.key === key)) setTabs([...tabs, { key, label: project.name, type: 'project', data: { projectId: project.id } }]);
    setActiveTabKey(key);
  };

  const openWorkflowTab = () => {
    const key = 'admin-workflows';
    if (!tabs.find(t => t.key === key)) setTabs([...tabs, { key, label: 'Workflow Manager', type: 'workflow' }]);
    setActiveTabKey(key);
  };

  // 👇 新增打开知识库的函数
  const openKnowledgeTab = () => {
    const key = 'knowledge-base';
    if (!tabs.find(t => t.key === key)) setTabs([...tabs, { key, label: 'Knowledge Base', type: 'knowledge' }]);
    setActiveTabKey(key);
  };

  const closeTab = (key: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (key === 'dashboard') return;
    const newTabs = tabs.filter(t => t.key !== key);
    setTabs(newTabs);
    if (activeTabKey === key) setActiveTabKey(newTabs[newTabs.length - 1].key);
  };

  const handleCreateSuccess = () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast.success('Project created!');
  };

  const filteredProjects = projects.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className="flex h-screen bg-gray-950 text-white overflow-hidden font-sans">
      {sidebarOpen && <div className="fixed inset-0 bg-black/60 z-40 md:hidden backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />}

      <aside className={`fixed md:static inset-y-0 left-0 z-50 w-64 bg-[#0d1117] border-r border-gray-800 flex flex-col transition-transform duration-300 ease-in-out ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        <div className="p-6 border-b border-gray-800 flex items-center gap-3">
          <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-blue-500 rounded-lg flex items-center justify-center shadow-lg"><span className="font-bold text-white">A</span></div>
          <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">Autonome</span>
        </div>
        <nav className="flex-1 p-4 space-y-2">
          <button onClick={() => { setActiveTabKey('dashboard'); setSidebarOpen(false); }} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${activeTabKey === 'dashboard' ? 'bg-blue-600/10 text-blue-400' : 'text-gray-400 hover:bg-gray-800'}`}>
            {NAV_ITEMS[0].icon} Dashboard
          </button>
          <button onClick={() => { openWorkflowTab(); setSidebarOpen(false); }} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${activeTabKey === 'admin-workflows' ? 'bg-purple-600/10 text-purple-400' : 'text-gray-400 hover:bg-gray-800'}`}>
            {NAV_ITEMS[1].icon} Workflows
          </button>
          {/* 👇 新增左侧菜单按钮 */}
          <button onClick={() => { openKnowledgeTab(); setSidebarOpen(false); }} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${activeTabKey === 'knowledge-base' ? 'bg-emerald-600/10 text-emerald-400' : 'text-gray-400 hover:bg-gray-800'}`}>
            {NAV_ITEMS[2].icon} Public Data
          </button>
        </nav>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 bg-gray-950 relative">
        <header className="h-12 border-b border-gray-800 bg-[#0d1117] flex items-center px-2 gap-1 overflow-x-auto scrollbar-hide flex-shrink-0">
            <button onClick={() => setSidebarOpen(true)} className="md:hidden p-2 text-gray-400 hover:text-white mr-2"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg></button>
            {tabs.map(tab => (
                <div key={tab.key} onClick={() => setActiveTabKey(tab.key)} className={`group flex items-center gap-2 px-4 py-1.5 rounded-t-lg text-xs font-medium cursor-pointer border-t-2 transition-all min-w-[120px] max-w-[200px] select-none ${activeTabKey === tab.key ? 'bg-gray-950 border-blue-500 text-white' : 'bg-gray-900/50 border-transparent text-gray-500 hover:bg-gray-900 hover:text-gray-300'}`}>
                    <span className="truncate flex-1">{tab.label}</span>
                    {tab.key !== 'dashboard' && (
                        <button onClick={(e) => closeTab(tab.key, e)} className="p-0.5 rounded hover:bg-gray-700 opacity-0 group-hover:opacity-100 transition-opacity"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
                    )}
                </div>
            ))}
        </header>

        <main className="flex-1 overflow-hidden relative">
            <div className={`absolute inset-0 flex flex-col p-8 overflow-y-auto ${activeTabKey === 'dashboard' ? 'z-10 bg-gray-950' : 'z-0 invisible'}`}>
                <div className="max-w-7xl mx-auto w-full space-y-8">
                    <div className="flex justify-between items-center">
                        <div><h1 className="text-3xl font-bold text-white">Your Projects</h1><p className="text-gray-400 text-sm mt-1">Select a project to open in a new tab.</p></div>
                        <div className="flex gap-3">
                            <input type="text" placeholder="Search..." className="bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-sm focus:border-blue-500 outline-none" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                            <button onClick={() => setShowCreate(true)} className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium">+ New Project</button>
                        </div>
                    </div>

                    {isLoading ? (
                        <div className="text-gray-500 text-sm animate-pulse">Loading projects...</div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {filteredProjects.map((project) => (
                                <div key={project.id} onClick={() => openProjectTab(project)} className="group bg-[#0f1218] border border-gray-800 rounded-xl p-6 hover:border-blue-500/50 hover:bg-gray-900/50 transition-all cursor-pointer relative">
                                    <div className="flex justify-between items-start mb-4">
                                        <div className="bg-blue-900/20 p-3 rounded-lg"><img src="/file.svg" className="w-6 h-6 opacity-70" alt="icon" /></div>
                                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button onClick={(e) => { e.stopPropagation(); setIsRenaming(project.id); setRenameValue(project.name); }} className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg></button>
                                            <button onClick={(e) => { e.stopPropagation(); if(confirm('Are you sure?')) deleteProjectMutation.mutate(project.id); }} className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-gray-800 rounded"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                                        </div>
                                    </div>
                                    {isRenaming === project.id ? (
                                        <input autoFocus className="bg-gray-800 border border-blue-500 rounded px-2 py-1 text-white w-full font-bold" value={renameValue} onChange={e => setRenameValue(e.target.value)} onKeyDown={e => { if(e.key === 'Enter') renameProjectMutation.mutate({ id: project.id, name: renameValue }); if(e.key === 'Escape') setIsRenaming(null); }} onBlur={() => setIsRenaming(null)} onClick={e => e.stopPropagation()} />
                                    ) : (
                                        <h3 className="text-xl font-bold mb-2 text-gray-100 group-hover:text-blue-400 transition-colors">{project.name}</h3>
                                    )}
                                    <p className="text-gray-500 text-sm line-clamp-2">{project.description || "No description."}</p>
                                    <div className="mt-4 pt-4 border-t border-gray-800 flex justify-between items-center text-xs text-gray-500">
                                        <span>{new Date(project.created_at).toLocaleDateString()}</span>
                                        <span className="text-blue-500 group-hover:underline">Open &rarr;</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {tabs.map(tab => {
                if (tab.type !== 'project') return null;
                const isActive = activeTabKey === tab.key;
                return (
                    <div key={tab.key} className={`absolute inset-0 bg-gray-950 ${isActive ? 'z-10' : 'z-0 invisible'}`}>
                        <ProjectWorkspace projectId={tab.data.projectId} onBack={() => closeTab(tab.key)} isActive={isActive} />
                    </div>
                );
            })}

            {tabs.map(tab => {
                if (tab.type !== 'workflow') return null;
                const isActive = activeTabKey === tab.key;
                return (
                    <div key={tab.key} className={`absolute inset-0 bg-gray-900 ${isActive ? 'z-10' : 'z-0 invisible'}`}>
                        <WorkflowManager onBack={() => closeTab(tab.key)} />
                    </div>
                );
            })}

            {/* 👇 渲染知识库选项卡 */}
            {tabs.map(tab => {
                if (tab.type !== 'knowledge') return null;
                const isActive = activeTabKey === tab.key;
                return (
                    <div key={tab.key} className={`absolute inset-0 bg-gray-900 flex flex-col ${isActive ? 'z-10' : 'z-0 invisible'}`}>
                        {/* 增加一个简单的返回头，保持风格统一 */}
                        <div className="px-8 py-4 border-b border-gray-800 bg-[#0d1117] flex justify-between items-center flex-shrink-0">
                           <div className="flex items-center gap-3">
                              <button onClick={() => closeTab(tab.key)} className="text-gray-500 hover:text-white transition-colors p-1 rounded hover:bg-gray-800">
                                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                              </button>
                              <h2 className="text-lg font-bold text-gray-200">Public Datasets</h2>
                           </div>
                        </div>
                        <KnowledgeBase />
                    </div>
                );
            })}

        </main>

        {showCreate && <CreateProjectModal onClose={() => setShowCreate(false)} onSuccess={handleCreateSuccess} />}
        {showUpload && <UploadModal projectId={activeProjectId} onClose={() => setShowUpload(false)} onUploadSuccess={() => {}} />}
      </div>
    </div>
  );
}