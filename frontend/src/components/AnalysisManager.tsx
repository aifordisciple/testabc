'use client';

import { useState, useEffect } from 'react';

interface Analysis {
  id: string;
  workflow: string;
  status: string;
  start_time: string;
  end_time?: string;
  sample_sheet_id?: string;
}

interface SampleSheet {
  id: string;
  name: string;
}

interface AnalysisManagerProps {
  projectId: string;
}

export default function AnalysisManager({ projectId }: AnalysisManagerProps) {
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [sheets, setSheets] = useState<SampleSheet[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  
  const [showRunModal, setShowRunModal] = useState(false);
  const [selectedSheetId, setSelectedSheetId] = useState('');
  
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);
  const [logContent, setLogContent] = useState('');

  // === 辅助函数：去除 ANSI 转义字符 ===
  // 这能把 [32m, [K, [3A 等乱码全部替换为空字符串，只保留纯文本
  const stripAnsi = (str: string) => {
    // eslint-disable-next-line
    return str.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
  };

  const fetchAnalyses = async () => {
    try {
      const token = localStorage.getItem('token');
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
      const res = await fetch(`${apiUrl}/workflow/projects/${projectId}/analyses`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) setAnalyses(await res.json());
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  const fetchSheets = async () => {
    try {
      const token = localStorage.getItem('token');
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
      const res = await fetch(`${apiUrl}/workflow/projects/${projectId}/sample_sheets`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setSheets(data);
        if (data.length > 0) setSelectedSheetId(data[0].id);
      }
    } catch (e) { console.error(e); }
  };

  useEffect(() => {
    fetchAnalyses();
    fetchSheets();
    const interval = setInterval(fetchAnalyses, 5000);
    return () => clearInterval(interval);
  }, [projectId]);

  const handleRun = async () => {
    if (!selectedSheetId) return alert("Please select a sample sheet first.");
    setRunning(true);
    try {
      const token = localStorage.getItem('token');
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
      const res = await fetch(`${apiUrl}/workflow/projects/${projectId}/analyses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          project_id: projectId,
          workflow: "rnaseq_qc",
          sample_sheet_id: selectedSheetId,
          params_json: "{}"
        })
      });
      if (res.ok) {
        alert('Workflow submitted successfully!');
        setShowRunModal(false);
        fetchAnalyses();
      } else {
        const err = await res.json();
        alert(`Failed: ${err.detail}`);
      }
    } catch (e) { alert('Network error'); } finally { setRunning(false); }
  };

  const handleViewLog = async (id: string) => {
    setSelectedLogId(id);
    setLogContent('Loading logs...');
    try {
      const token = localStorage.getItem('token');
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
      const res = await fetch(`${apiUrl}/workflow/analyses/${id}/log`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setLogContent(data.log);
      } else { setLogContent('Failed to load logs'); }
    } catch (e) { setLogContent('Network error'); }
  };

  const handleViewReport = async (id: string) => {
    try {
        const token = localStorage.getItem('token');
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
        const res = await fetch(`${apiUrl}/workflow/analyses/${id}/report`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            window.open(url, '_blank');
        } else {
            alert('Report not found or not ready.');
        }
    } catch (e) { alert('Error opening report'); }
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
          onClick={() => setShowRunModal(true)}
          className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-lg shadow-emerald-900/20 flex items-center gap-2"
        >
          ▶ Run Analysis
        </button>
      </div>

      {showRunModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
            <div className="bg-gray-900 p-6 rounded-xl border border-gray-700 w-96 shadow-xl">
                <h3 className="text-lg font-bold text-white mb-4">Run RNA-Seq QC</h3>
                <div className="mb-4">
                    <label className="block text-xs text-gray-400 mb-1">Select Sample Sheet</label>
                    {sheets.length > 0 ? (
                        <select 
                            className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white outline-none"
                            value={selectedSheetId}
                            onChange={(e) => setSelectedSheetId(e.target.value)}
                        >
                            {sheets.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                    ) : (
                        <div className="text-red-400 text-xs">No sample sheets found.</div>
                    )}
                </div>
                <div className="flex justify-end gap-3 mt-6">
                    <button onClick={() => setShowRunModal(false)} className="text-gray-400 hover:text-white text-sm">Cancel</button>
                    <button 
                        onClick={handleRun} 
                        disabled={running || sheets.length === 0}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded text-sm disabled:opacity-50"
                    >
                        {running ? 'Submitting...' : 'Run Now'}
                    </button>
                </div>
            </div>
        </div>
      )}

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
                    {a.status === 'completed' && (
                        <button 
                            onClick={() => handleViewReport(a.id)} 
                            className="text-emerald-400 hover:text-emerald-300 font-medium"
                        >
                            Report
                        </button>
                    )}
                </td>
              </tr>
            ))}
            {analyses.length === 0 && (
                <tr><td colSpan={5} className="p-8 text-center text-gray-500">No analysis runs yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      
      {selectedLogId && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-8">
            <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-4xl h-[80vh] flex flex-col shadow-2xl">
                <div className="p-4 border-b border-gray-800 flex justify-between items-center">
                    <h3 className="font-mono text-sm text-blue-400">Execution Log</h3>
                    <button onClick={() => setSelectedLogId(null)} className="text-gray-400 hover:text-white">✕</button>
                </div>
                <div className="flex-1 p-4 overflow-auto bg-black rounded-b-xl">
                    {/* ⚠️ 核心修改：使用 stripAnsi 处理日志内容 */}
                    <pre className="text-xs text-green-400 font-mono whitespace-pre-wrap">{stripAnsi(logContent)}</pre>
                </div>
            </div>
        </div>
      )}
    </div>
  );
}