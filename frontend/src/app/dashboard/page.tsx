'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import CreateProjectModal from '@/components/CreateProjectModal';
import UploadModal from '@/components/UploadModal';
import ProjectWorkspace from '@/components/ProjectWorkspace';
import WorkflowManager from '@/components/WorkflowManager';
import toast from 'react-hot-toast';

// --- 类型定义 ---
interface Project {
  id: string;
  name: string;
  description: string;
  created_at: string;
}

interface Tab {
  key: string;       // 唯一标识 (如 'dashboard', 'project-123')
  label: string;     // 显示标题
  type: 'dashboard' | 'project' | 'workflow';
  data?: any;        // 附加数据 (如 projectId)
}

// 侧边栏导航
const NAV_ITEMS = [
  { id: 'projects', label: 'Projects', icon: (<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>) },
  { id: 'workflows', label: 'Workflows', icon: (<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>) },
];

export default function Dashboard() {
  const router = useRouter();
  
  // --- 状态管理 ---
  // Tabs: 默认只有 Dashboard
  const [tabs, setTabs] = useState<Tab[]>([{ key: 'dashboard', label: 'Dashboard', type: 'dashboard' }]);
  const [activeTabKey, setActiveTabKey] = useState('dashboard');

  const [projects, setProjects] = useState<Project[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  
  // Modals
  const [showCreate, setShowCreate] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [activeProjectId, setActiveProjectId] = useState('');
  const [isRenaming, setIsRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  // --- 初始化数据 ---
  const fetchProjects = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) { router.push('/'); return; }
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
      const res = await fetch(`${apiUrl}/files/projects`, { headers: { 'Authorization': `Bearer ${token}` } });
      if (res.ok) setProjects(await res.json());
      else if (res.status === 401) router.push('/');
    } catch (error) { console.error(error); }
  };

  useEffect(() => { fetchProjects(); }, []);

  // --- Tab 操作 ---
  const openProjectTab = (project: Project) => {
    const key = `project-${project.id}`;
    // 如果 Tab 已存在，切换过去
    if (!tabs.find(t => t.key === key)) {
      setTabs([...tabs, { key, label: project.name, type: 'project', data: { projectId: project.id } }]);
    }
    setActiveTabKey(key);
  };

  const openWorkflowTab = () => {
    const key = 'admin-workflows';
    if (!tabs.find(t => t.key === key)) {
      setTabs([...tabs, { key, label: 'Workflow Manager', type: 'workflow' }]);
    }
    setActiveTabKey(key);
  };

  const closeTab = (key: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (key === 'dashboard') return; // Dashboard 不可关闭
    const newTabs = tabs.filter(t => t.key !== key);
    setTabs(newTabs);
    if (activeTabKey === key) {
      setActiveTabKey(newTabs[newTabs.length - 1].key);
    }
  };

  // --- Project List Actions ---
  const handleCreateSuccess = () => { fetchProjects(); toast.success('Project created!'); };
  const handleDeleteProject = async (e: React.MouseEvent, projectId: string) => {
    e.stopPropagation();
    if (!confirm("Are you sure?")) return;
    try {
        const token = localStorage.getItem('token');
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
        const res = await fetch(`${apiUrl}/files/projects/${projectId}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
        if (res.ok) { 
            toast.success("Deleted"); 
            fetchProjects(); 
            // 如果该项目有打开的 Tab，关闭它
            closeTab(`project-${projectId}`);
        }
    } catch (e) { toast.error("Network error"); }
  };
  const startRename = (e: React.MouseEvent, project: Project) => { e.stopPropagation(); setIsRenaming(project.id); setRenameValue(project.name); };
  const handleRenameSubmit = async (projectId: string) => {
      if (!renameValue.trim()) return;
      try {
        const token = localStorage.getItem('token');
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
        const res = await fetch(`${apiUrl}/files/projects/${projectId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify({ name: renameValue }) });
        if (res.ok) { 
            toast.success("Renamed"); 
            setIsRenaming(null); 
            fetchProjects(); 
            // 更新 Tab 标题
            setTabs(prev => prev.map(t => t.key === `project-${projectId}` ? { ...t, label: renameValue } : t));
        }
      } catch (e) { toast.error("Network error"); }
  };

  const filteredProjects = projects.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className="flex h-screen bg-gray-950 text-white overflow-hidden font-sans">
      
      {/* Mobile Overlay */}
      {sidebarOpen && <div className="fixed inset-0 bg-black/60 z-40 md:hidden backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />}

      {/* Sidebar */}
      <aside className={`fixed md:static inset-y-0 left-0 z-1 w-64 bg-[#0d1117] border-r border-gray-800 flex flex-col transition-transform duration-300 ease-in-out ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
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
        </nav>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 bg-gray-950 relative">
        {/* Tab Bar */}
        <header className="h-12 border-b border-gray-800 bg-[#0d1117] flex items-center px-2 gap-1 overflow-x-auto scrollbar-hide">
            <button onClick={() => setSidebarOpen(true)} className="md:hidden p-2 text-gray-400 hover:text-white mr-2"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg></button>
            
            {tabs.map(tab => (
                <div 
                    key={tab.key}
                    onClick={() => setActiveTabKey(tab.key)}
                    className={`
                        group flex items-center gap-2 px-4 py-1.5 rounded-t-lg text-xs font-medium cursor-pointer border-t-2 transition-all min-w-[120px] max-w-[200px] select-none
                        ${activeTabKey === tab.key 
                            ? 'bg-gray-950 border-blue-500 text-white' 
                            : 'bg-gray-900/50 border-transparent text-gray-500 hover:bg-gray-900 hover:text-gray-300'
                        }
                    `}
                >
                    <span className="truncate flex-1">{tab.label}</span>
                    {tab.key !== 'dashboard' && (
                        <button 
                            onClick={(e) => closeTab(tab.key, e)}
                            className="p-0.5 rounded hover:bg-gray-700 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                    )}
                </div>
            ))}
        </header>

        {/* Tab Contents (KeepAlive: 使用 hidden 而不是条件渲染，以保留组件状态) */}
        <main className="flex-1 overflow-hidden relative">
            {/* 1. Dashboard Tab */}
            <div className={`absolute inset-0 flex flex-col p-8 overflow-y-auto ${activeTabKey === 'dashboard' ? 'z-10 bg-gray-950' : 'z-0 invisible'}`}>
                <div className="max-w-7xl mx-auto w-full space-y-8">
                    <div className="flex justify-between items-center">
                        <div><h1 className="text-3xl font-bold text-white">Your Projects</h1><p className="text-gray-400 text-sm mt-1">Select a project to open in a new tab.</p></div>
                        <div className="flex gap-3">
                            <input type="text" placeholder="Search..." className="bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-sm focus:border-blue-500 outline-none" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                            <button onClick={() => setShowCreate(true)} className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium">+ New Project</button>
                        </div>
                    </div>

                    {/* Project Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {filteredProjects.map((project) => (
                            <div key={project.id} onClick={() => openProjectTab(project)} className="group bg-[#0f1218] border border-gray-800 rounded-xl p-6 hover:border-blue-500/50 hover:bg-gray-900/50 transition-all cursor-pointer relative">
                                <div className="flex justify-between items-start mb-4">
                                    <div className="bg-blue-900/20 p-3 rounded-lg"><img src="/file.svg" className="w-6 h-6 opacity-70" alt="icon" /></div>
                                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button onClick={(e) => startRename(e, project)} className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg></button>
                                        <button onClick={(e) => handleDeleteProject(e, project.id)} className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-gray-800 rounded"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                                    </div>
                                </div>
                                {isRenaming === project.id ? (
                                    <input autoFocus className="bg-gray-800 border border-blue-500 rounded px-2 py-1 text-white w-full font-bold" value={renameValue} onChange={e => setRenameValue(e.target.value)} onKeyDown={e => { if(e.key === 'Enter') handleRenameSubmit(project.id); if(e.key === 'Escape') setIsRenaming(null); }} onBlur={() => setIsRenaming(null)} onClick={e => e.stopPropagation()} />
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
                </div>
            </div>

            {/* 2. Dynamic Project Tabs (KeepAlive) */}
            {tabs.map(tab => {
                if (tab.type !== 'project') return null;
                return (
                    <div key={tab.key} className={`absolute inset-0 bg-gray-950 ${activeTabKey === tab.key ? 'z-10' : 'z-0 invisible'}`}>
                        <ProjectWorkspace projectId={tab.data.projectId} onBack={() => closeTab(tab.key)} />
                    </div>
                );
            })}

            {/* 3. Workflow Manager Tab (KeepAlive) */}
            {tabs.map(tab => {
                if (tab.type !== 'workflow') return null;
                return (
                    <div key={tab.key} className={`absolute inset-0 bg-gray-900 ${activeTabKey === tab.key ? 'z-10' : 'z-0 invisible'}`}>
                        <WorkflowManager onBack={() => closeTab(tab.key)} />
                    </div>
                );
            })}
        </main>

        {showCreate && <CreateProjectModal onClose={() => setShowCreate(false)} onSuccess={handleCreateSuccess} />}
        {showUpload && <UploadModal projectId={activeProjectId} currentFolderId={null} onClose={() => setShowUpload(false)} onUploadSuccess={() => {}} />}
      </div>
    </div>
  );
}