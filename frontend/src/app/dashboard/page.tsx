'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import UploadModal from '@/components/UploadModal';
import CreateProjectModal from '@/components/CreateProjectModal'; // 👈 引入新组件

interface Project {
  id: string;
  name: string;
  status: string;
  date: string;
  description?: string;
}

export default function Dashboard() {
  const router = useRouter();
  
  // === 状态管理 ===
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  
  // 弹窗状态
  const [showUpload, setShowUpload] = useState(false);
  const [showCreate, setShowCreate] = useState(false); // 👈 新增：新建项目弹窗状态

  // === 获取项目列表 ===
  const fetchProjects = async () => {
    try {
      // 保持 isLoading 为 true 稍微短一点，或者在重新获取时不显示全屏 loading，体验更好
      // 这里为了简单，还是设为 true
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      const token = localStorage.getItem('token');

      if (!token) {
        router.push('/');
        return;
      }
      
      const res = await fetch(`${apiUrl}/files/projects`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (res.ok) {
        const data = await res.json();
        const mappedProjects = data.map((p: any) => ({
          id: p.id,
          name: p.name,
          status: 'Active', 
          date: new Date(p.created_at).toLocaleDateString(),
          description: p.description
        }));
        
        setProjects(mappedProjects);
        
        // 如果当前没有选中的项目，且列表不为空，默认选中第一个
        if (mappedProjects.length > 0 && !activeProjectId) {
          setActiveProjectId(mappedProjects[0].id);
        }
      } else if (res.status === 401) {
        localStorage.removeItem('token');
        router.push('/');
      }
    } catch (error) {
      console.error("无法连接到服务器", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  // === 回调函数 ===
  const handleUploadSuccess = () => {
    console.log('文件上传成功');
    // 如果后续要在项目卡片显示文件数，这里可以重新 fetchProjects
  };

  const handleCreateSuccess = () => {
    // 创建成功后，重新拉取列表，这样新项目就会立刻显示出来
    fetchProjects();
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* 导航栏 */}
      <nav className="border-b border-gray-800 bg-gray-900/50 backdrop-blur-md sticky top-0 z-10">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 bg-gradient-to-tr from-blue-500 to-emerald-500 rounded-lg shadow-[0_0_15px_rgba(59,130,246,0.5)]"></div>
              <span className="font-bold text-xl tracking-tight bg-gradient-to-r from-white to-gray-400 text-transparent bg-clip-text">
                Autonome
              </span>
            </div>
            
            <div className="flex items-center gap-4">
              <span className="text-xs text-gray-500 font-mono hidden sm:block">
                Region: AWS-US-East
              </span>
              
              {/* 👇 修改：点击触发新建弹窗 */}
              <button 
                onClick={() => setShowCreate(true)}
                className="bg-gray-800 hover:bg-gray-700 px-3 py-1.5 rounded-md text-sm border border-gray-700 transition-colors flex items-center gap-2"
              >
                <span>+</span> New Project
              </button>
              
              <button 
                onClick={() => {
                   localStorage.removeItem('token');
                   router.push('/');
                }}
                className="text-xs text-red-400 hover:text-red-300 border border-red-900 bg-red-900/20 px-3 py-1.5 rounded-md"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* 主内容 */}
      <main className="py-10">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-end mb-8">
            <div>
              <h1 className="text-3xl font-bold leading-tight tracking-tight text-white">
                Digital Bench
              </h1>
              <p className="mt-2 text-gray-400 text-sm">
                Manage your sequencing data and analysis pipelines.
              </p>
            </div>
          </div>
          
          {isLoading ? (
            <div className="text-center py-20 text-gray-500 animate-pulse">
              加载中...
            </div>
          ) : projects.length === 0 ? (
            <div className="text-center py-20 border-2 border-dashed border-gray-800 rounded-xl bg-gray-900/20">
              <p className="text-gray-400 mb-4 font-medium">暂无项目</p>
              <p className="text-sm text-gray-600 mb-6">
                您还没有创建任何科研项目。
              </p>
              <button 
                onClick={() => setShowCreate(true)}
                className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                Create Your First Project
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {/* 上传卡片 */}
              <div 
                onClick={() => {
                  if (activeProjectId) setShowUpload(true);
                  else alert("请先选择一个项目");
                }}
                className="relative group block p-6 bg-gray-900/40 border-2 border-dashed border-gray-800 rounded-xl hover:border-blue-500/50 hover:bg-blue-900/10 transition-all cursor-pointer h-full min-h-[180px]"
              >
                <div className="flex flex-col items-center justify-center h-full text-center space-y-3">
                  <div className="h-12 w-12 rounded-full bg-gray-800 group-hover:bg-blue-600 transition-colors flex items-center justify-center">
                    <svg className="w-6 h-6 text-gray-400 group-hover:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-lg font-medium text-white group-hover:text-blue-400 transition-colors">Import Data</h3>
                    <p className="text-gray-500 text-xs mt-1">FASTQ / BAM / VCF</p>
                  </div>
                </div>
              </div>

              {/* 项目列表 */}
              {projects.map((project) => (
                <div 
                  key={project.id} 
                  onClick={() => setActiveProjectId(project.id)}
                  className={`bg-gray-900 border overflow-hidden rounded-xl hover:shadow-[0_8px_30px_rgb(0,0,0,0.12)] transition-all flex flex-col ${
                    activeProjectId === project.id ? 'border-blue-500/50 shadow-[0_0_15px_rgba(59,130,246,0.2)]' : 'border-gray-800 hover:border-gray-700'
                  }`}
                >
                  <div className="px-6 py-5 sm:p-6 flex-1 cursor-pointer">
                    <div className="flex items-center justify-between mb-4">
                      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border bg-emerald-950/30 text-emerald-400 border-emerald-900">
                        <span className="w-1.5 h-1.5 rounded-full mr-1.5 bg-emerald-400"></span>
                        {project.status}
                      </span>
                      <span className="text-xs text-gray-500 font-mono">{project.date}</span>
                    </div>
                    <h3 className="text-base font-semibold leading-6 text-white group-hover:text-blue-400">
                      {project.name}
                    </h3>
                    <p className="mt-2 text-sm text-gray-400 line-clamp-2">
                      {project.description || 'No description provided.'}
                    </p>
                  </div>
                  
                  <div className="bg-gray-800/30 px-6 py-3 border-t border-gray-800 flex justify-between items-center">
                    <span className="text-xs text-gray-500 font-mono">
                      ID: {project.id.slice(0, 8)}...
                    </span>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveProjectId(project.id);
                        setShowUpload(true);
                      }}
                      className="text-sm font-medium text-blue-400 hover:text-blue-300 transition-colors"
                    >
                      Upload &rarr;
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* 弹窗区域 */}
      {showUpload && activeProjectId && (
        <UploadModal 
          projectId={activeProjectId} 
          onClose={() => setShowUpload(false)}
          onUploadSuccess={handleUploadSuccess}
        />
      )}

      {/* 👇 新增：新建项目弹窗 */}
      {showCreate && (
        <CreateProjectModal 
          onClose={() => setShowCreate(false)}
          onSuccess={handleCreateSuccess}
        />
      )}
    </div>
  );
}