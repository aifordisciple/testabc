'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import UploadModal from '@/components/UploadModal';
import SampleManager from '@/components/SampleManager'; // 👈 引入样本管理组件
import AnalysisManager from '@/components/AnalysisManager';

// === 1. 类型定义 ===
interface FileData {
  id: string;
  filename: string;
  size: number;
  uploaded_at: string;
  content_type: string;
  is_directory: boolean;
}

interface ProjectDetail {
  id: string;
  name: string;
  description: string;
}

interface Breadcrumb {
  id: string;
  name: string;
}

// === 2. 辅助函数：获取文件图标 ===
const getFileIcon = (filename: string, isDir: boolean) => {
  if (isDir) return { 
    icon: <svg className="w-6 h-6 text-yellow-500" fill="currentColor" viewBox="0 0 20 20"><path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" /></svg>, 
    color: 'text-yellow-500' 
  };

  const ext = filename.split('.').pop()?.toLowerCase() || '';
  
  if (['fastq', 'fq', 'gz'].includes(ext)) return { icon: <span className="text-xl">🧬</span>, color: 'text-emerald-400' };
  if (['bam', 'sam', 'bai'].includes(ext)) return { icon: <span className="text-xl">📦</span>, color: 'text-red-400' };
  if (['vcf'].includes(ext)) return { icon: <span className="text-xl">⚡</span>, color: 'text-purple-400' };
  
  if (['pdf'].includes(ext)) return { icon: <span className="text-xl">📄</span>, color: 'text-white' };
  if (['csv', 'xls', 'xlsx', 'tsv'].includes(ext)) return { icon: <span className="text-xl">📊</span>, color: 'text-green-400' };
  if (['png', 'jpg', 'jpeg'].includes(ext)) return { icon: <span className="text-xl">🖼️</span>, color: 'text-blue-300' };

  return { 
    icon: <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>, 
    color: 'text-blue-400' 
  };
};

// === 3. 子组件：关联项目弹窗 ===
function LinkProjectModal({ fileId, currentProjectId, onClose, onSuccess }: any) {
  const [projects, setProjects] = useState<ProjectDetail[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchProjects = async () => {
      const token = localStorage.getItem('token');
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      const res = await fetch(`${apiUrl}/files/projects`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        const others = data.filter((p: any) => p.id !== currentProjectId);
        setProjects(others);
        if (others.length > 0) setSelectedProjectId(others[0].id);
      }
    };
    fetchProjects();
  }, [currentProjectId]);

  const handleSubmit = async () => {
    if (!selectedProjectId) return alert('请选择一个项目');
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      const res = await fetch(`${apiUrl}/files/files/${fileId}/link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ target_project_id: selectedProjectId })
      });

      if (res.ok) {
        alert('关联成功！');
        onSuccess();
        onClose();
      } else {
        const err = await res.json();
        alert(err.status === 'already_linked' ? '该文件已在目标项目中' : `关联失败: ${err.detail}`);
      }
    } catch (e) { alert('网络错误'); } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
      <div className="bg-gray-900 p-6 rounded-xl border border-gray-700 w-96 shadow-2xl">
        <h3 className="text-xl font-bold text-white mb-4">Add to another Project</h3>
        {projects.length === 0 ? (
          <div className="text-yellow-500 text-sm mb-4">无其他项目可选。</div>
        ) : (
          <select 
            className="w-full bg-gray-800 border border-gray-700 rounded-md p-2 text-white mb-6 outline-none"
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
          >
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="text-gray-400 hover:text-white text-sm">Cancel</button>
          <button onClick={handleSubmit} disabled={loading || projects.length === 0} className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm disabled:opacity-50">
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

// === 4. 主页面组件 ===
export default function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = use(params);
  const router = useRouter();
  
  // === Tab 状态管理 ===
  const [activeTab, setActiveTab] = useState<'data' | 'samples' | 'analysis'>('data');

  // === Data Tab 状态 ===
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [files, setFiles] = useState<FileData[]>([]);
  const [breadcrumbs, setBreadcrumbs] = useState<Breadcrumb[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [linkTargetFileId, setLinkTargetFileId] = useState<string | null>(null);

  // === 获取数据 ===
  const fetchData = async () => {
    try {
      const token = localStorage.getItem('token');
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      
      // 1. 获取项目详情 (仅首次)
      if (!project) {
        const resProj = await fetch(`${apiUrl}/files/projects/${projectId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!resProj.ok) throw new Error('Project not found');
        setProject(await resProj.json());
      }

      // 2. 只有在 'data' Tab 才加载文件列表
      if (activeTab === 'data') {
        let url = `${apiUrl}/files/projects/${projectId}/files`;
        if (currentFolderId) url += `?folder_id=${currentFolderId}`;
        
        const resFiles = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (resFiles.ok) {
          const data = await resFiles.json();
          setFiles(data.files);
          setBreadcrumbs(data.breadcrumbs);
        }
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [currentFolderId, activeTab]); // 切换 Tab 或 目录 时刷新

  // === 文件操作 Handlers ===
  const handleCreateFolder = async () => {
    const name = prompt("Folder Name:");
    if (!name) return;
    try {
      const token = localStorage.getItem('token');
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      let url = `${apiUrl}/files/projects/${projectId}/folders?folder_name=${encodeURIComponent(name)}`;
      if (currentFolderId) url += `&parent_id=${currentFolderId}`;

      const res = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) fetchData();
    } catch (e) { alert('网络错误'); }
  };

  const handleDownload = async (fileId: string) => {
    try {
      const token = localStorage.getItem('token');
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      const res = await fetch(`${apiUrl}/files/files/${fileId}/download`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const { download_url } = await res.json();
        window.open(download_url, '_blank');
      } else { alert('无法下载'); }
    } catch (e) { alert('请求失败'); }
  };

  const handleRename = async (fileId: string, currentName: string) => {
    const newName = prompt("New Filename:", currentName);
    if (!newName || newName === currentName) return;
    try {
      const token = localStorage.getItem('token');
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      const res = await fetch(`${apiUrl}/files/files/${fileId}/rename`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ new_name: newName })
      });
      if (res.ok) fetchData();
    } catch (e) { alert('网络错误'); }
  };

  const handleRemoveLink = async (fileId: string) => {
    if (!confirm('从项目中移除此项？')) return;
    try {
      const token = localStorage.getItem('token');
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      const res = await fetch(`${apiUrl}/files/projects/${projectId}/files/${fileId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) fetchData();
    } catch (e) { alert('网络错误'); }
  };

  const handleHardDelete = async (fileId: string, isDir: boolean) => {
    if (!confirm(`⚠️ 彻底删除${isDir ? '文件夹' : '文件'}？无法恢复！`)) return;
    try {
      const token = localStorage.getItem('token');
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      const res = await fetch(`${apiUrl}/files/files/${fileId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) fetchData();
      else { const err = await res.json(); alert(`失败: ${err.detail}`); }
    } catch (e) { alert('网络错误'); }
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '-';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const filteredFiles = files.filter(f => f.filename.toLowerCase().includes(searchTerm.toLowerCase()));

  if (loading && !project) return <div className="min-h-screen bg-gray-950 flex items-center justify-center text-white">Loading...</div>;

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* 顶部导航 */}
      <nav className="border-b border-gray-800 bg-gray-900/50 p-4 sticky top-0 backdrop-blur z-10">
        <div className="max-w-7xl mx-auto flex items-center gap-4">
          <button onClick={() => router.push('/dashboard')} className="text-gray-400 hover:text-white">
            &larr; Dashboard
          </button>
          <div className="h-6 w-px bg-gray-700"></div>
          <h1 className="font-bold text-lg truncate">{project?.name}</h1>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto p-8">
        {/* 项目头部 & Tabs */}
        <div className="mb-8">
            <h2 className="text-3xl font-bold mb-2">Project Workspace</h2>
            <p className="text-gray-400 text-sm mb-6">{project?.description || 'No description'}</p>
            
            <div className="flex border-b border-gray-800 space-x-6">
                <button 
                    onClick={() => setActiveTab('data')}
                    className={`pb-3 text-sm font-medium transition-colors border-b-2 ${activeTab === 'data' ? 'border-blue-500 text-white' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
                >
                    Data & Files
                </button>
                <button 
                    onClick={() => setActiveTab('samples')}
                    className={`pb-3 text-sm font-medium transition-colors border-b-2 ${activeTab === 'samples' ? 'border-purple-500 text-white' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
                >
                    Samples
                </button>
                <button 
                    onClick={() => setActiveTab('analysis')}
                    className={`pb-3 text-sm font-medium transition-colors border-b-2 ${activeTab === 'analysis' ? 'border-emerald-500 text-white' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
                >
                    Analysis & Workflows
                </button>
            </div>
        </div>

        {/* === TAB 1: DATA (原有文件浏览器) === */}
        {activeTab === 'data' && (
            <div className="animate-in fade-in duration-300">
                <div className="flex justify-between items-center mb-4">
                    <input 
                        type="text" placeholder="Search files..." 
                        className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-blue-500 w-64"
                        value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                    />
                    <div className="flex gap-3">
                        <button onClick={handleCreateFolder} className="bg-gray-800 hover:bg-gray-700 text-white px-3 py-2 rounded-lg text-sm border border-gray-700">+ Folder</button>
                        <button onClick={() => setShowUpload(true)} className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-2 rounded-lg text-sm">+ Upload</button>
                    </div>
                </div>

                {/* 面包屑 */}
                <div className="flex items-center gap-2 text-sm text-gray-400 mb-4 bg-gray-900/50 p-2 rounded-lg border border-gray-800">
                    <span className={`cursor-pointer hover:text-white ${!currentFolderId ? 'font-bold text-white' : ''}`} onClick={() => setCurrentFolderId(null)}>Root</span>
                    {breadcrumbs.map((b) => (
                        <div key={b.id} className="flex items-center gap-2"><span>/</span><span className={`cursor-pointer hover:text-white ${currentFolderId === b.id ? 'font-bold text-white' : ''}`} onClick={() => setCurrentFolderId(b.id)}>{b.name}</span></div>
                    ))}
                </div>

                {/* 文件列表 */}
                <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden shadow-sm min-h-[300px]">
                    <table className="w-full text-left">
                        <thead className="bg-gray-800/50 text-gray-400 text-xs uppercase">
                            <tr><th className="px-6 py-3">Name</th><th className="px-6 py-3">Size</th><th className="px-6 py-3">Type</th><th className="px-6 py-3 text-right">Actions</th></tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800">
                            {filteredFiles.length === 0 && <tr><td colSpan={4} className="p-8 text-center text-gray-500">No files found.</td></tr>}
                            {filteredFiles.map((file) => {
                                const { icon } = getFileIcon(file.filename, file.is_directory);
                                return (
                                <tr key={file.id} className="hover:bg-gray-800/50 transition-colors group">
                                    <td className="px-6 py-4 font-medium text-white">
                                        <div className={`flex items-center gap-3 ${file.is_directory ? 'cursor-pointer' : ''}`} onClick={() => file.is_directory && setCurrentFolderId(file.id)}>
                                            {icon} <span className={file.is_directory ? 'font-bold text-yellow-500' : ''}>{file.filename}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-gray-400 text-sm font-mono">{formatSize(file.size)}</td>
                                    <td className="px-6 py-4 text-gray-500 text-sm">{file.is_directory ? 'Folder' : file.content_type}</td>
                                    <td className="px-6 py-4 text-right flex justify-end gap-3 opacity-80 group-hover:opacity-100">
                                        {!file.is_directory && <button onClick={() => handleDownload(file.id)} className="text-blue-400 hover:text-blue-300">Down</button>}
                                        <button onClick={() => setLinkTargetFileId(file.id)} className="text-emerald-400 hover:text-emerald-300">Share</button>
                                        <button onClick={() => handleRename(file.id, file.filename)} className="text-yellow-400 hover:text-yellow-300">Ren</button>
                                        <button onClick={() => handleRemoveLink(file.id)} className="text-gray-400 hover:text-white">Unlink</button>
                                        <button onClick={() => handleHardDelete(file.id, file.is_directory)} className="text-red-500 hover:text-red-400">Del</button>
                                    </td>
                                </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        )}

        {/* === TAB 2: SAMPLES (新功能) === */}
        {activeTab === 'samples' && (
            <div className="animate-in fade-in duration-300">
                <SampleManager projectId={projectId} />
            </div>
        )}

        {/* === TAB 3: ANALYSIS (占位符) === */}
        {activeTab === 'analysis' && (
            <div className="animate-in fade-in duration-300">
                <AnalysisManager projectId={projectId} />
            </div>
        )}

      </main>

      {/* 弹窗组件 */}
      {isUploadModalOpen && (
        <UploadModal 
          projectId={projectId as string}
          currentFolderId={currentFolderId} // 👈 关键：确保传入了当前进入的文件夹ID
          onClose={() => setIsUploadModalOpen(false)}
          onUploadSuccess={() => {
            fetchFiles(currentFolderId); // 刷新当前目录
          }}
        />
      )}

      {linkTargetFileId && (
        <LinkProjectModal
          fileId={linkTargetFileId}
          currentProjectId={projectId}
          onClose={() => setLinkTargetFileId(null)}
          onSuccess={fetchData}
        />
      )}
    </div>
  );
}