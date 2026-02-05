'use client';

import { useState, useEffect } from 'react';

interface Analysis {
  id: string;
  workflow: string;
  status: string;
  start_time: string;
  end_time?: string;
}

interface AnalysisManagerProps {
  projectId: string;
}

export default function AnalysisManager({ projectId }: AnalysisManagerProps) {
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);
  const [logContent, setLogContent] = useState('');

  const fetchAnalyses = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/workflow/projects/${projectId}/analyses`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) setAnalyses(await res.json());
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  useEffect(() => {
    fetchAnalyses();
    const interval = setInterval(fetchAnalyses, 5000);
    return () => clearInterval(interval);
  }, [projectId]);

  const handleRun = async () => {
    // ⚠️ 更改：默认使用 rnaseq_qc 流程
    if (!confirm("Run 'RNA-seq QC' pipeline? (This may take a few minutes)")) return;
    setRunning(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/workflow/projects/${projectId}/analyses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          project_id: projectId,
          workflow: "rnaseq_qc", // 👈 指定新流程
          params_json: "{}"
        })
      });
      
      if (res.ok) {
        alert('Workflow submitted!');
        fetchAnalyses();
      } else {
        alert('Failed to submit workflow');
      }
    } catch (e) { alert('Network error'); } finally { setRunning(false); }
  };

  const handleViewLog = async (id: string) => {
    setSelectedLogId(id);
    setLogContent('Loading logs...');
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/workflow/analyses/${id}/log`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setLogContent(data.log);
      } else { setLogContent('Failed to load logs'); }
    } catch (e) { setLogContent('Network error'); }
  };

  // ⚠️ 新增：打开报告
  const handleViewReport = (id: string) => {
    const token = localStorage.getItem('token');
    // 使用 window.open 打开 API 地址，浏览器会自动展示 HTML
    // 注意：如果 API 需要 Header 鉴权，直接 open 可能不行。
    // 但我们的 API 如果是 GET 且是文件下载，通常可以用 URL query param 传 token (如果支持)，
    // 或者在同域下依赖 Cookie。
    // **简易方案**：这里我们假设直接访问，如果后端强制需要 Header Authorization，
    // 图片/HTML预览通常比较麻烦。
    // **生产环境做法**：前端 fetch blob -> createObjectURL -> open。
    // 下面用 fetch blob 方案：
    
    window.open(`${process.env.NEXT_PUBLIC_API_URL}/workflow/analyses/${id}/report?token=${token}`, '_blank');
  };

  const getStatusColor = (status: string) => {
    switch (status) {
        case 'completed': return 'bg-emerald-900/50 text-emerald-400 border-emerald-900';
        case 'failed': return 'bg-red-900/50 text-red-400 border-red-900';
        case 'running': return 'bg-blue-900/50 text-blue-400 border-blue-900 animate-pulse';
        default: return 'bg-gray-700 text-gray-300';
    }
  };

  if (loading) return <div className="text-gray-500">Loading analyses...</div>;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
            <h3 className="text-xl font-bold text-white">Analysis History</h3>
            <p className="text-gray-400 text-xs mt-1">Run bioinformatics pipelines on your samples.</p>
        </div>
        <button 
          onClick={handleRun}
          disabled={running}
          className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-lg shadow-emerald-900/20 disabled:opacity-50 flex items-center gap-2"
        >
          {running ? 'Submitting...' : '▶ Run RNA-seq QC'}
        </button>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden mb-8">
        <table className="w-full text-left">
          <thead className="bg-gray-800/50 text-gray-400 text-xs uppercase">
            <tr>
              <th className="px-6 py-3">ID</th>
              <th className="px-6 py-3">Workflow</th>
              <th className="px-6 py-3">Status</th>
              <th className="px-6 py-3">Start Time</th>
              <th className="px-6 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800 text-sm">
            {analyses.map((a) => (
              <tr key={a.id} className="hover:bg-gray-800/30 text-gray-300">
                <td className="px-6 py-4 font-mono text-xs text-gray-500">{a.id.slice(0, 8)}...</td>
                <td className="px-6 py-4 font-medium text-white">{a.workflow}</td>
                <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded text-xs border ${getStatusColor(a.status)} uppercase`}>
                        {a.status}
                    </span>
                </td>
                <td className="px-6 py-4 text-gray-500">{new Date(a.start_time).toLocaleString()}</td>
                <td className="px-6 py-4 text-right">
                    <button onClick={() => handleViewLog(a.id)} className="text-blue-400 hover:text-blue-300 mr-4">Logs</button>
                    
                    {/* 报告按钮 */}
                    {a.status === 'completed' && (
                        <button 
                            onClick={() => {
                                // 简单的打开方式 (需后端支持 Query Token 或 Cookie，
                                // 为了简化演示，我们这里先尝试 fetch 方式)
                                fetch(`${process.env.NEXT_PUBLIC_API_URL}/workflow/analyses/${a.id}/report`, {
                                    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
                                })
                                .then(res => {
                                    if(res.ok) return res.blob();
                                    throw new Error('Report not found');
                                })
                                .then(blob => {
                                    const url = window.URL.createObjectURL(blob);
                                    window.open(url, '_blank');
                                })
                                .catch(err => alert(err.message));
                            }} 
                            className="text-emerald-400 hover:text-emerald-300 font-medium"
                        >
                            View Report
                        </button>
                    )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      {/* 日志弹窗 (保持不变) */}
      {selectedLogId && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-8">
            <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-4xl h-[80vh] flex flex-col shadow-2xl">
                <div className="p-4 border-b border-gray-800 flex justify-between items-center">
                    <h3 className="font-mono text-sm text-blue-400">Execution Log</h3>
                    <button onClick={() => setSelectedLogId(null)} className="text-gray-400 hover:text-white">✕</button>
                </div>
                <div className="flex-1 p-4 overflow-auto bg-black rounded-b-xl">
                    <pre className="text-xs text-green-400 font-mono whitespace-pre-wrap">{logContent}</pre>
                </div>
            </div>
        </div>
      )}
    </div>
  );
}