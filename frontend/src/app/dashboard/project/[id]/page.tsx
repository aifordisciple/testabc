'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import UploadModal from '@/components/UploadModal';

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
    icon: <svg className="w-6 h-6 text-yellow-500" fill="currentColor" viewBox="0 0 20 20"><path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" /></svg>, 
    color: 'text-yellow-500' 
  };

  const ext = filename.split('.').pop()?.toLowerCase() || '';
  
  // 生信特定格式
  if (['fastq', 'fq', 'gz'].includes(ext)) return { icon: <span className="text-xl">🧬</span>, color: 'text-emerald-400' };
  if (['bam', 'sam', 'bai'].includes(ext)) return { icon: <span className="text-xl">📦</span>, color: 'text-red-400' };
  if (['vcf'].includes(ext)) return { icon: <span className="text-xl">⚡</span>, color: 'text-purple-400' };
  if (['fasta', 'fa'].includes(ext)) return { icon: <span className="text-xl">📜</span>, color: 'text-blue-400' };
  
  // 通用格式
  if (['pdf'].includes(ext)) return { icon: <span className="text-xl">📄</span>, color: 'text-white' };
  if (['csv', 'xls', 'xlsx', 'tsv'].includes(ext)) return { icon: <span className="text-xl">📊</span>, color: 'text-green-400' };
  if (['png', 'jpg', 'jpeg'].includes(ext)) return { icon: <span className="text-xl">🖼️</span>, color: 'text-blue-300' };
  if (['txt', 'md', 'json'].includes(ext)) return { icon: <span className="text-xl">📝</span>, color: 'text-gray-400' };

  // 默认图标
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
        alert(err.status === 'already_linked' ? '该文件/文件夹已在目标项目中' : `关联失败: ${err.detail}`);
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
            {loading ? 'Confirm' : 'Confirm'}
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
  
  // 状态管理
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [files, setFiles] = useState<FileData[]>([]);
  const [breadcrumbs, setBreadcrumbs] = useState<Breadcrumb[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState(''); // 🔍 搜索状态
  
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [linkTargetFileId, setLinkTargetFileId] = useState<string | null>(null);

  // === 获取数据 ===
  const fetchData = async () => {
    try {
      const token = localStorage.getItem('token');
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      
      // 1. 项目详情
      if (!project) {
        const resProj = await fetch(`${apiUrl}/files/projects/${projectId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!resProj.ok) throw new Error('Project not found');
        setProject(await resProj.json());
      }

      // 2. 文件列表
      let url = `${apiUrl}/files/projects/${projectId}/files`;
      if (currentFolderId) url += `?folder_id=${currentFolderId}`;
      
      const resFiles = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (resFiles.ok) {
        const data = await resFiles.json();
        setFiles(data.files);
        setBreadcrumbs(data.breadcrumbs);
      }
    } catch (error) {
      console.error(error);
      // router.push('/dashboard'); // 调试时可注释
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [currentFolderId]);

  // === 操作 Handlers ===
  const handleCreateFolder = async () => {
    const name = prompt("Folder Name:");
    if (!name) return;
    try {
      const token = localStorage.getItem('token');
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      let url = `${apiUrl}/files/projects/${projectId}/folders?folder_name=${encodeURIComponent(name)}`;
      if (currentFolderId) url += `&parent_id=${currentFolderId}`;

      const res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) fetchData();
      else alert('创建失败');
    } catch (e) { alert('网络错误'); }
  };

  const handleDownload = async (fileId: string) => {
    try {
      const token = localStorage.getItem('token');
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      const res = await fetch(`${apiUrl}/files/files/${fileId}/download`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const { download_url } = await res.json();
        window.open(download_url, '_blank');
      } else {
        alert('无法下载 (可能是文件夹)');
      }
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
    if (!confirm('从项目中移除此项？(文件/文件夹实体将保留)')) return;
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
    const msg = isDir 
      ? '⚠️ 彻底删除文件夹？(所有子文件也会被删除或失去索引，请谨慎！)' 
      : '⚠️ 彻底物理删除该文件？无法恢复！';
    if (!confirm(msg)) return;
    try {
      const token = localStorage.getItem('token');
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      const res = await fetch(`${apiUrl}/files/files/${fileId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) { alert('已删除'); fetchData(); }
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

  // 🔍 过滤文件列表
  const filteredFiles = files.filter(f => 
    f.filename.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading && !project) return <div className="min-h-screen bg-gray-950 flex items-center justify-center text-white">Loading...</div>;

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* 顶部导航 */}
      <nav className="border-b border-gray-800 bg-gray-900/50 p-4 sticky top-0 backdrop-blur z-10">
        <div className="max-w-7xl mx-auto flex items-center gap-4">
          <button onClick={() => router.push('/dashboard')} className="text-gray-400 hover:text-white">
            &larr; Back to Dashboard
          </button>
          <div className="h-6 w-px bg-gray-700"></div>
          <h1 className="font-bold text-lg truncate">{project?.name}</h1>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto p-8">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h2 className="text-3xl font-bold mb-2">Project Data</h2>
            <p className="text-gray-400 max-w-2xl text-sm">{project?.description || 'No description'}</p>
          </div>
          <div className="flex gap-3">
             <button onClick={handleCreateFolder} className="bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-lg border border-gray-700 transition-colors">
                + New Folder
             </button>
             <button onClick={() => setShowUpload(true)} className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg shadow-lg shadow-blue-900/20 transition-colors">
                + Upload Data
             </button>
          </div>
        </div>

        {/* 搜索框 (新增) */}
        <div className="mb-4">
          <input 
            type="text" 
            placeholder="🔍 Search files in this folder..." 
            className="w-full bg-gray-900 border border-gray-800 rounded-lg px-4 py-3 text-sm text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {/* 面包屑导航 */}
        <div className="flex items-center gap-2 text-sm text-gray-400 mb-4 bg-gray-900/50 p-3 rounded-lg border border-gray-800 overflow-x-auto">
           <span 
             className={`cursor-pointer hover:text-white hover:underline whitespace-nowrap ${!currentFolderId ? 'font-bold text-white' : ''}`}
             onClick={() => setCurrentFolderId(null)}
           >
             Root
           </span>
           {breadcrumbs.map((b) => (
             <div key={b.id} className="flex items-center gap-2 whitespace-nowrap">
               <span>/</span>
               <span 
                 className={`cursor-pointer hover:text-white hover:underline ${currentFolderId === b.id ? 'font-bold text-white' : ''}`}
                 onClick={() => setCurrentFolderId(b.id)}
               >
                 {b.name}
               </span>
             </div>
           ))}
        </div>

        {/* 文件列表 */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden shadow-xl min-h-[400px]">
            <table className="w-full text-left">
              <thead className="bg-gray-800/50 text-gray-400 text-xs uppercase">
                <tr>
                  <th className="px-6 py-3 font-medium">Name</th>
                  <th className="px-6 py-3 font-medium">Size</th>
                  <th className="px-6 py-3 font-medium">Type</th>
                  <th className="px-6 py-3 font-medium">Date</th>
                  <th className="px-6 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {filteredFiles.length === 0 && (
                   <tr><td colSpan={5} className="p-8 text-center text-gray-500">
                      {searchTerm ? 'No files match your search' : '此文件夹为空'}
                   </td></tr>
                )}
                
                {filteredFiles.map((file) => {
                  const { icon, color } = getFileIcon(file.filename, file.is_directory);
                  
                  return (
                  <tr key={file.id} className="hover:bg-gray-800/50 transition-colors group">
                    <td className="px-6 py-4 font-medium text-white">
                      <div 
                        className={`flex items-center gap-3 ${file.is_directory ? 'cursor-pointer' : ''}`}
                        onClick={() => file.is_directory && setCurrentFolderId(file.id)}
                      >
                        {/* 动态图标 */}
                        {icon}
                        
                        <span className={`${file.is_directory ? 'font-bold text-yellow-500 hover:underline' : ''}`}>
                           {file.filename}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-gray-400 text-sm font-mono">{formatSize(file.size)}</td>
                    <td className="px-6 py-4 text-gray-500 text-sm">{file.is_directory ? 'Folder' : file.content_type}</td>
                    <td className="px-6 py-4 text-gray-500 text-sm">{new Date(file.uploaded_at).toLocaleDateString()}</td>
                    
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-3 opacity-80 group-hover:opacity-100 transition-opacity">
                        
                        {!file.is_directory && (
                          <button onClick={() => handleDownload(file.id)} className="text-blue-400 hover:text-blue-300 p-1 hover:bg-blue-900/20 rounded" title="Download">
                             <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                          </button>
                        )}
                        
                        {/* Share / Link (现在支持文件夹！) */}
                        <button 
                          onClick={() => setLinkTargetFileId(file.id)} 
                          className="text-emerald-400 hover:text-emerald-300 p-1 hover:bg-emerald-900/20 rounded" 
                          title="Share to another Project"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>
                        </button>

                        {/* Rename */}
                        <button onClick={() => handleRename(file.id, file.filename)} className="text-yellow-400 hover:text-yellow-300 p-1 hover:bg-yellow-900/20 rounded" title="Rename">
                           <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                        </button>

                        {/* Unlink */}
                        <button onClick={() => handleRemoveLink(file.id)} className="text-gray-400 hover:text-white p-1 hover:bg-gray-700/50 rounded" title="Remove from Project">
                           <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
                        </button>

                        {/* Hard Delete */}
                        <button onClick={() => handleHardDelete(file.id, file.is_directory)} className="text-red-500 hover:text-red-400 p-1 hover:bg-red-900/20 rounded" title="Permanently Delete">
                           <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
        </div>
      </main>

      {/* UploadModal */}
      {showUpload && (
        <UploadModal 
           projectId={projectId} 
           parentId={currentFolderId} 
           onClose={() => setShowUpload(false)} 
           onUploadSuccess={fetchData} 
        />
      )}

      {/* 关联弹窗 */}
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