'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation'; // 引入路由，用于未登录跳转
import UploadModal from '@/components/UploadModal';

// 定义前端展示用的项目接口
interface Project {
  id: string;
  name: string;
  status: string;
  date: string;
  description?: string;
}

export default function Dashboard() {
  const router = useRouter(); // 路由钩子
  const [showUpload, setShowUpload] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);

  // === 核心逻辑：从后端获取项目列表 (带 Token) ===
  const fetchProjects = async () => {
    try {
      setIsLoading(true);
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      const token = localStorage.getItem('token'); // 👇 获取 Token

      // 如果没 Token，直接踢回登录页
      if (!token) {
        alert('请先登录');
        router.push('/');
        return;
      }
      
      const res = await fetch(`${apiUrl}/files/projects`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` // 👈 关键：带上 Token 身份证
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
        
        if (mappedProjects.length > 0 && !activeProjectId) {
          setActiveProjectId(mappedProjects[0].id);
        }
      } else if (res.status === 401) {
        // Token 过期或无效
        alert('登录已过期，请重新登录');
        localStorage.removeItem('token');
        router.push('/');
      } else {
        console.error("获取项目失败:", res.statusText);
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

  const handleUploadSuccess = () => {
    console.log('文件上传成功！');
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
              <button 
                onClick={() => alert('请在 Swagger 创建项目 (记得点右上角 Authorize 锁头输入 Token)')}
                className="bg-gray-800 hover:bg-gray-700 px-3 py-1.5 rounded-md text-sm border border-gray-700 transition-colors"
              >
                + New Project
              </button>
              {/* 退出登录按钮 */}
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
              正在加载您的专属项目...
            </div>
          ) : projects.length === 0 ? (
            <div className="text-center py-20 border-2 border-dashed border-gray-800 rounded-xl">
              <p className="text-gray-400 mb-4">暂无项目</p>
              <p className="text-sm text-gray-600">
                请先在 Swagger UI 创建项目<br/>
                (注意：现在 API 需要 Token 验证了)
              </p>
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

      {/* 上传弹窗 */}
      {showUpload && activeProjectId && (
        <UploadModal 
          projectId={activeProjectId} 
          onClose={() => setShowUpload(false)}
          onUploadSuccess={handleUploadSuccess}
        />
      )}
    </div>
  );
}