'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import UploadModal from '@/components/UploadModal';
import CreateProjectModal from '@/components/CreateProjectModal';

interface Project {
  id: string;
  name: string;
  status: string;
  date: string;
  description?: string;
}

// 👈 新增：用量数据接口
interface UsageData {
  used_bytes: number;
  limit_bytes: number;
  percentage: number;
}

export default function Dashboard() {
  const router = useRouter();
  
  // === 状态管理 ===
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  
  // 👈 新增：用量状态
  const [usage, setUsage] = useState<UsageData>({ used_bytes: 0, limit_bytes: 1, percentage: 0 });
  
  // 弹窗状态
  const [showUpload, setShowUpload] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  // === 工具函数：格式化字节 ===
  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // === 获取数据 ===
  const fetchData = async () => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      const token = localStorage.getItem('token');

      if (!token) {
        router.push('/');
        return;
      }
      
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      };

      // 1. 并行请求：获取项目列表 + 获取存储用量
      const [resProjects, resUsage] = await Promise.all([
        fetch(`${apiUrl}/files/projects`, { method: 'GET', headers }),
        fetch(`${apiUrl}/files/usage`, { method: 'GET', headers })
      ]);
      
      // 处理项目列表
      if (resProjects.ok) {
        const data = await resProjects.json();
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
      } else if (resProjects.status === 401) {
        localStorage.removeItem('token');
        router.push('/');
      }

      // 👈 处理用量数据
      if (resUsage.ok) {
        setUsage(await resUsage.json());
      }

    } catch (error) {
      console.error("无法连接到服务器", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // === 回调函数 ===
  const handleUploadSuccess = () => {
    fetchData(); // 上传后刷新，不仅为了新文件，也为了更新空间使用量
  };

  const handleCreateSuccess = () => {
    fetchData();
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* 导航栏 */}
      <nav className="border-b border-gray-800 bg-gray-900/50 backdrop-blur-md sticky top-0 z-10">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 justify-between items-center">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 bg-gradient-to-tr from-blue-500 to-emerald-500 rounded-lg shadow-[0_0_15px_rgba(59,130,246,0.5)]"></div>
              <span className="font-bold text-xl tracking-tight bg-gradient-to-r from-white to-gray-400 text-transparent bg-clip-text">
                Autonome
              </span>
            </div>
            
            {/* 右侧工具栏 */}
            <div className="flex items-center gap-6">
              
              {/* 👈 新增：存储空间展示 Widget */}
              <div className="hidden md:block w-48 group">
                <div className="flex justify-between text-xs text-gray-400 mb-1.5">
                  <span className="font-medium text-gray-300">Storage</span>
                  <span>{usage.percentage}%</span>
                </div>
                <div className="h-2 w-full bg-gray-800 rounded-full overflow-hidden border border-gray-700/50">
                  <div 
                    className={`h-full rounded-full transition-all duration-1000 ease-out ${
                      usage.percentage > 90 ? 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]' : 
                      usage.percentage > 70 ? 'bg-yellow-500' : 
                      'bg-gradient-to-r from-blue-500 to-emerald-400'
                    }`}
                    style={{ width: `${usage.percentage}%` }}
                  ></div>
                </div>
                <div className="text-[10px] text-gray-500 text-right mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {formatSize(usage.used_bytes)} / {formatSize(usage.limit_bytes)}
                </div>
              </div>

              <div className="h-6 w-px bg-gray-800 mx-2 hidden md:block"></div>

              {/* 按钮组 */}
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
                className="text-xs text-red-400 hover:text-red-300 border border-red-900/50 bg-red-900/10 px-3 py-1.5 rounded-md hover:bg-red-900/20 transition-colors"
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
              正在加载实验室数据...
            </div>
          ) : projects.length === 0 ? (
            <div className="text-center py-20 border-2 border-dashed border-gray-800 rounded-xl bg-gray-900/20">
              <p className="text-gray-400 mb-4 font-medium">暂无项目</p>
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
                  onClick={() => router.push(`/dashboard/project/${project.id}`)}
                  className="bg-gray-900 border border-gray-800 overflow-hidden rounded-xl hover:shadow-[0_8px_30px_rgb(0,0,0,0.12)] hover:border-gray-700 transition-all flex flex-col cursor-pointer group"
                >
                  <div className="px-6 py-5 sm:p-6 flex-1">
                    <div className="flex items-center justify-between mb-4">
                      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border bg-emerald-950/30 text-emerald-400 border-emerald-900">
                        <span className="w-1.5 h-1.5 rounded-full mr-1.5 bg-emerald-400"></span>
                        {project.status}
                      </span>
                      <span className="text-xs text-gray-500 font-mono">{project.date}</span>
                    </div>
                    <h3 className="text-base font-semibold leading-6 text-white group-hover:text-blue-400 transition-colors">
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
                    <span className="text-xs text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                       View Project &rarr;
                    </span>
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
          currentFolderId={null} // ✅ 修正：改为 currentFolderId
          onClose={() => setShowUpload(false)}
          onUploadSuccess={handleUploadSuccess}
        />
      )}

      {showCreate && (
        <CreateProjectModal 
          onClose={() => setShowCreate(false)}
          onSuccess={handleCreateSuccess}
        />
      )}
    </div>
  );
}