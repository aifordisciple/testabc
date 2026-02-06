'use client';

import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import DynamicParamsForm from './DynamicParamsForm';

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

interface WorkflowTemplate {
  id: string;
  name: string;
  category: string;
  script_path: string;
  params_schema: string;
}

interface AnalysisManagerProps {
  projectId: string;
}

export default function AnalysisManager({ projectId }: AnalysisManagerProps) {
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [sheets, setSheets] = useState<SampleSheet[]>([]);
  const [workflows, setWorkflows] = useState<WorkflowTemplate[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  
  const [showRunModal, setShowRunModal] = useState(false);
  
  const [selectedSheetId, setSelectedSheetId] = useState('');
  const [selectedWorkflowId, setSelectedWorkflowId] = useState('');
  const [params, setParams] = useState<Record<string, any>>({});
  
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);
  const [logContent, setLogContent] = useState('');

  const stripAnsi = (str: string) => {
    // eslint-disable-next-line
    return str.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
  };

  // 1. 数据加载逻辑 (移除在这里设置默认值的逻辑，防止闭包陷阱)
  const fetchData = async () => {
    try {
      const token = localStorage.getItem('token');
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
      
      // Load History
      const resAna = await fetch(`${apiUrl}/workflow/projects/${projectId}/analyses`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (resAna.ok) setAnalyses(await resAna.json());

      // Load Sample Sheets
      const resSheets = await fetch(`${apiUrl}/workflow/projects/${projectId}/sample_sheets`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (resSheets.ok) {
          const data = await resSheets.json();
          setSheets(data);
      }

      // Load Workflows
      const resWf = await fetch(`${apiUrl}/admin/workflows`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (resWf.ok) {
          const data = await resWf.json();
          setWorkflows(data);
      }

    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  // 2. 轮询
  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [projectId]);

  // 3. 独立 Effect：自动选择默认 Sample Sheet
  // 只有当列表存在且当前未选择时才执行，避免覆盖用户的选择
  useEffect(() => {
    if (sheets.length > 0 && !selectedSheetId) {
      setSelectedSheetId(sheets[0].id);
    }
  }, [sheets, selectedSheetId]);

  // 4. 独立 Effect：自动选择默认 Workflow
  useEffect(() => {
    if (workflows.length > 0 && !selectedWorkflowId) {
      setSelectedWorkflowId(workflows[0].id);
    }
  }, [workflows, selectedWorkflowId]);

  const handleRun = async () => {
    if (!selectedSheetId || !selectedWorkflowId) {
        toast.error("Please select a sample sheet and a workflow.");
        return;
    }
    
    const wf = workflows.find(w => w.id === selectedWorkflowId);
    if (!wf) return;

    setRunning(true);
    const loadingToast = toast.loading(`Starting ${wf.name}...`);

    try {
      const token = localStorage.getItem('token');
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
      
      const res = await fetch(`${apiUrl}/workflow/projects/${projectId}/analyses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          project_id: projectId,
          workflow: wf.script_path,
          sample_sheet_id: selectedSheetId,
          params_json: JSON.stringify(params)
        })
      });
      
      if (res.ok) {
        toast.success('Workflow submitted!', { id: loadingToast });
        setShowRunModal(false);
        fetchData();
      } else {
        const err = await res.json();
        toast.error(`Failed: ${err.detail}`, { id: loadingToast });
      }
    } catch (e) { 
        toast.error('Network error', { id: loadingToast });
    } finally { setRunning(false); }
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
    const loadingToast = toast.loading("Opening report...");
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
            toast.dismiss(loadingToast);
        } else {
            toast.error('Report not found or not ready.', { id: loadingToast });
        }
    } catch (e) { 
        toast.error('Error opening report', { id: loadingToast });
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
        case 'completed': return 'bg-emerald-900/50 text-emerald-400 border-emerald-900';
        case 'failed': return 'bg-red-900/50 text-red-400 border-red-900';
        case 'running': return 'bg-blue-900/50 text-blue-400 border-blue-900 animate-pulse';
        default: return 'bg-gray-700 text-gray-300';
    }
  };

  const currentWorkflow = workflows.find(w => w.id === selectedWorkflowId);

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
          ▶ Run New Analysis
        </button>
      </div>

      {showRunModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-900 p-6 rounded-xl border border-gray-700 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto flex flex-col">
                <h3 className="text-lg font-bold text-white mb-6 border-b border-gray-800 pb-2">Start Analysis</h3>
                
                <div className="space-y-6 flex-1">
                    {/* 1. Select Workflow */}
                    <div>
                        <label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">1. Select Pipeline</label>
                        {workflows.length > 0 ? (
                            <select 
                                className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white outline-none focus:border-blue-500 transition-colors"
                                value={selectedWorkflowId}
                                onChange={(e) => setSelectedWorkflowId(e.target.value)}
                            >
                                {workflows.map(w => (
                                    <option key={w.id} value={w.id}>
                                        {w.category} / {w.name}
                                    </option>
                                ))}
                            </select>
                        ) : (
                            <div className="text-red-400 text-sm bg-red-900/20 p-2 rounded">No workflows available. Ask admin to create one.</div>
                        )}
                        {currentWorkflow?.name && (
                            <p className="text-xs text-gray-500 mt-2 italic">{currentWorkflow.name}</p>
                        )}
                    </div>

                    {/* 2. Select Sample Sheet */}
                    <div>
                        <label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">2. Select Data</label>
                        {sheets.length > 0 ? (
                            <select 
                                className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white outline-none focus:border-blue-500 transition-colors"
                                value={selectedSheetId}
                                onChange={(e) => setSelectedSheetId(e.target.value)}
                            >
                                {sheets.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                        ) : (
                            <div className="text-yellow-500 text-sm bg-yellow-900/20 p-2 rounded">No sample sheets found. Create one in 'Samples' tab first.</div>
                        )}
                    </div>

                    {/* 3. Configure Parameters (Dynamic) */}
                    <div>
                        <label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">3. Configure Parameters</label>
                        <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
                            {currentWorkflow ? (
                                <DynamicParamsForm 
                                    schemaStr={currentWorkflow.params_schema} 
                                    onChange={(vals) => setParams(vals)} 
                                />
                            ) : (
                                <div className="text-gray-500 text-sm">Select a workflow to configure parameters.</div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex justify-end gap-3 mt-8 pt-4 border-t border-gray-800">
                    <button onClick={() => setShowRunModal(false)} className="text-gray-400 hover:text-white text-sm px-3 py-2">Cancel</button>
                    <button 
                        onClick={handleRun} 
                        disabled={running || workflows.length === 0 || sheets.length === 0}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-2 rounded-lg text-sm font-medium shadow-lg shadow-emerald-900/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                        {running ? 'Submitting...' : '🚀 Launch Analysis'}
                    </button>
                </div>
            </div>
        </div>
      )}

      {/* Analysis List */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden mb-8 shadow-xl">
        <table className="w-full text-left">
          <thead className="bg-gray-800/50 text-gray-400 text-xs uppercase">
            <tr>
              <th className="px-6 py-3 font-medium">ID</th>
              <th className="px-6 py-3 font-medium">Pipeline</th>
              <th className="px-6 py-3 font-medium">Status</th>
              <th className="px-6 py-3 font-medium">Date</th>
              <th className="px-6 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800 text-sm">
            {analyses.map((a) => (
              <tr key={a.id} className="hover:bg-gray-800/30 text-gray-300 transition-colors">
                <td className="px-6 py-4 font-mono text-xs text-gray-500">{a.id.slice(0, 8)}...</td>
                <td className="px-6 py-4 font-medium text-white">{a.workflow}</td>
                <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-[10px] font-bold border ${getStatusColor(a.status)} uppercase tracking-wide`}>
                        {a.status}
                    </span>
                </td>
                <td className="px-6 py-4 text-gray-500">{new Date(a.start_time).toLocaleString()}</td>
                <td className="px-6 py-4 text-right">
                    <button onClick={() => handleViewLog(a.id)} className="text-blue-400 hover:text-blue-300 mr-4 font-medium">Logs</button>
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
                <tr><td colSpan={5} className="p-8 text-center text-gray-500">No analyses running yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      
      {selectedLogId && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-8 animate-in fade-in duration-200">
            <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-5xl h-[85vh] flex flex-col shadow-2xl">
                <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-gray-800/50 rounded-t-xl">
                    <h3 className="font-mono text-sm text-blue-400 font-bold">Execution Log</h3>
                    <button onClick={() => setSelectedLogId(null)} className="text-gray-400 hover:text-white p-1 hover:bg-gray-700 rounded">✕</button>
                </div>
                <div className="flex-1 p-4 overflow-auto bg-[#0d1117] rounded-b-xl">
                    <pre className="text-xs text-green-400 font-mono whitespace-pre-wrap leading-relaxed">{stripAnsi(logContent)}</pre>
                </div>
            </div>
        </div>
      )}
    </div>
  );
}