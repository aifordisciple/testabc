'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import CreateProjectModal from '@/components/CreateProjectModal';
import UploadModal from '@/components/UploadModal';
import toast from 'react-hot-toast';

interface Project {
  id: string;
  name: string;
  description: string;
  created_at: string;
}

export default function Dashboard() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [activeProjectId, setActiveProjectId] = useState('');
  
  // 搜索过滤
  const [searchQuery, setSearchQuery] = useState('');

  // 状态：重命名
  const [isRenaming, setIsRenaming] = useState<string | null>(null); // 存储正在重命名的 project id
  const [renameValue, setRenameValue] = useState('');

  const fetchProjects = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        router.push('/');
        return;
      }
      
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
      const res = await fetch(`${apiUrl}/files/projects`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (res.ok) {
        setProjects(await res.json());
      } else if (res.status === 401) {
        router.push('/');
      }
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  const handleCreateSuccess = () => {
    fetchProjects();
    toast.success('Project created!');
  };

  const handleUploadSuccess = () => {
    toast.success('Upload complete!');
  };

  const handleDeleteProject = async (e: React.MouseEvent, projectId: string) => {
    e.stopPropagation(); // 防止触发卡片点击跳转
    if (!confirm("Are you sure you want to delete this project? This will NOT delete the physical files, but will remove all analysis history and associations.")) return;

    try {
        const token = localStorage.getItem('token');
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
        const res = await fetch(`${apiUrl}/files/projects/${projectId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (res.ok) {
            toast.success("Project deleted");
            fetchProjects();
        } else {
            toast.error("Delete failed");
        }
    } catch (e) {
        toast.error("Network error");
    }
  };

  const startRename = (e: React.MouseEvent, project: Project) => {
      e.stopPropagation();
      setIsRenaming(project.id);
      setRenameValue(project.name);
  };

  const handleRenameSubmit = async (projectId: string) => {
      if (!renameValue.trim()) return;
      try {
        const token = localStorage.getItem('token');
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
        const res = await fetch(`${apiUrl}/files/projects/${projectId}`, {
            method: 'PATCH',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}` 
            },
            body: JSON.stringify({ name: renameValue })
        });

        if (res.ok) {
            toast.success("Renamed successfully");
            setIsRenaming(null);
            fetchProjects();
        } else {
            toast.error("Rename failed");
        }
      } catch (e) { toast.error("Network error"); }
  };

  // 过滤项目
  const filteredProjects = projects.filter(p => 
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    (p.description && p.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="min-h-screen bg-gray-950 text-white p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-emerald-400">
              Dashboard
            </h1>
            <p className="text-gray-400 mt-2">Manage your bioinformatics projects</p>
          </div>
          <div className="flex gap-4">
            {/* 👇 新增：Admin 入口按钮 */}
            <button 
                onClick={() => router.push('/admin/workflows')}
                className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-4 py-2 rounded-lg text-sm font-medium border border-gray-700 transition-all"
            >
                ⚙️ Manage Workflows
            </button>

            <input 
                type="text" 
                placeholder="Search projects..." 
                className="bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-blue-500"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
            />
            <button 
              onClick={() => setShowCreate(true)}
              className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-lg font-medium transition-all shadow-lg shadow-blue-900/20"
            >
              + New Project
            </button>
          </div>
        </div>
        
        {/* ... (保留剩下的内容) ... */}

        {filteredProjects.length === 0 ? (
            <div className="text-center py-20 text-gray-600">
                <p className="text-xl">No projects found.</p>
                <p className="text-sm mt-2">Create a new project to get started.</p>
            </div>
        ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredProjects.map((project) => (
                <div 
                key={project.id}
                onClick={() => router.push(`/dashboard/project/${project.id}`)}
                className="bg-gray-900 border border-gray-800 rounded-xl p-6 hover:border-gray-600 transition-all cursor-pointer group relative"
                >
                <div className="flex justify-between items-start mb-4">
                    <div className="bg-blue-900/30 p-3 rounded-lg">
                        <img src="/file.svg" className="w-6 h-6 opacity-80" alt="icon" />
                    </div>
                    
                    {/* 操作按钮组 (Hover显示) */}
                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                            onClick={(e) => startRename(e, project)}
                            className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded"
                            title="Rename"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                        </button>
                        <button 
                            onClick={(e) => handleDeleteProject(e, project.id)}
                            className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-gray-800 rounded"
                            title="Delete"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                    </div>
                </div>

                {isRenaming === project.id ? (
                    <div onClick={e => e.stopPropagation()} className="mb-2">
                        <input 
                            autoFocus
                            className="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-white w-full text-lg font-bold"
                            value={renameValue}
                            onChange={e => setRenameValue(e.target.value)}
                            onKeyDown={e => {
                                if(e.key === 'Enter') handleRenameSubmit(project.id);
                                if(e.key === 'Escape') setIsRenaming(null);
                            }}
                            onBlur={() => setIsRenaming(null)}
                        />
                    </div>
                ) : (
                    <h3 className="text-xl font-bold mb-2 truncate text-gray-100">{project.name}</h3>
                )}
                
                <p className="text-gray-400 text-sm h-10 overflow-hidden text-ellipsis">
                    {project.description || "No description provided."}
                </p>
                <div className="mt-4 pt-4 border-t border-gray-800 flex justify-between items-center text-xs text-gray-500">
                    <span>Created: {new Date(project.created_at).toLocaleDateString()}</span>
                    <span className="text-emerald-500 hover:underline">View Details &rarr;</span>
                </div>
                
                {/* 快捷上传按钮 */}
                <button 
                    onClick={(e) => {
                        e.stopPropagation();
                        setActiveProjectId(project.id);
                        setShowUpload(true);
                    }}
                    className="absolute bottom-6 right-6 opacity-0 group-hover:opacity-100 transition-opacity bg-gray-800 hover:bg-gray-700 p-2 rounded-full border border-gray-700"
                    title="Quick Upload"
                >
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                </button>
                </div>
            ))}
            </div>
        )}

        {showCreate && (
          <CreateProjectModal 
            onClose={() => setShowCreate(false)} 
            onSuccess={handleCreateSuccess} 
          />
        )}

        {showUpload && (
          <UploadModal
            projectId={activeProjectId}
            currentFolderId={null} // 仪表盘上的快捷上传默认到根目录
            onClose={() => setShowUpload(false)}
            onUploadSuccess={handleUploadSuccess}
          />
        )}
      </div>
    </div>
  );
}