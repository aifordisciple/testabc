'use client';

import { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import DynamicParamsForm from './DynamicParamsForm';

interface Analysis { id: string; workflow: string; status: string; start_time: string; end_time?: string; sample_sheet_id?: string; }
interface SampleSheet { id: string; name: string; }
interface ProjectFile { id: string; filename: string; s3_key: string; is_directory: boolean; }
interface WorkflowTemplate { id: string; name: string; category: string; script_path: string; params_schema: string; workflow_type: string; }

// 👈 增加 isActive 属性
interface AnalysisManagerProps { projectId: string; isActive?: boolean; }

const fetchAPI = async (endpoint: string) => {
    const token = localStorage.getItem('token');
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
    const res = await fetch(`${apiUrl}${endpoint}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`API fetch error on ${endpoint}`);
    return res.json();
};

export default function AnalysisManager({ projectId, isActive = true }: AnalysisManagerProps) {
  const queryClient = useQueryClient();
  
  const [showRunModal, setShowRunModal] = useState(false);
  const [taskType, setTaskType] = useState<'PIPELINE' | 'TOOL'>('PIPELINE');
  const [selectedSheetId, setSelectedSheetId] = useState('');
  const [selectedWorkflowId, setSelectedWorkflowId] = useState('');
  const [params, setParams] = useState<Record<string, any>>({});
  
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);
  const [logContent, setLogContent] = useState('');
  const wsRef = useRef<WebSocket | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // 1. 获取分析列表 (仅在 isActive 时轮询！)
  const { data: analyses = [], isLoading: loadingAnalyses } = useQuery<Analysis[]>({
    queryKey: ['analyses', projectId],
    queryFn: () => fetchAPI(`/workflow/projects/${projectId}/analyses`),
    // 👈 核心优化：Tab 不可见时，直接停止轮询，极大节省后端资源
    refetchInterval: isActive ? 5000 : false, 
  });

  const { data: sheets = [] } = useQuery<SampleSheet[]>({
    queryKey: ['sampleSheets', projectId],
    queryFn: () => fetchAPI(`/workflow/projects/${projectId}/sample_sheets`),
    enabled: isActive // 仅在可见时拉取
  });

  const { data: workflows = [] } = useQuery<WorkflowTemplate[]>({
    queryKey: ['workflows'],
    queryFn: () => fetchAPI(`/admin/workflows`),
    enabled: isActive
  });

  const { data: filesData } = useQuery({
    queryKey: ['files', projectId, 'recursive'],
    queryFn: () => fetchAPI(`/files/projects/${projectId}/files?recursive=true`),
    enabled: isActive
  });
  const files: ProjectFile[] = filesData?.files?.filter((f: ProjectFile) => !f.is_directory) || [];

  const runAnalysisMutation = useMutation({
    mutationFn: async (payload: any) => {
        const token = localStorage.getItem('token');
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
        const res = await fetch(`${apiUrl}/workflow/projects/${projectId}/analyses`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify(payload)
        });
        if (!res.ok) throw await res.json();
        return res.json();
    },
    onSuccess: () => {
        toast.success('Task submitted successfully!');
        setShowRunModal(false);
        queryClient.invalidateQueries({ queryKey: ['analyses', projectId] });
    },
    onError: (err: any) => {
        let errorMsg = "Unknown error";
        if (typeof err.detail === 'string') errorMsg = err.detail;
        else if (Array.isArray(err.detail)) errorMsg = err.detail.map((e: any) => `${e.loc.join('.')}: ${e.msg}`).join('; ');
        else errorMsg = JSON.stringify(err.detail || err);
        toast.error(`Failed: ${errorMsg}`);
    }
  });

  useEffect(() => { if (sheets.length > 0 && !selectedSheetId) setSelectedSheetId(sheets[0].id); }, [sheets, selectedSheetId]);

  const availableWorkflows = workflows.filter(w => w.workflow_type === taskType);

  useEffect(() => {
    if (availableWorkflows.length > 0) {
      if (!availableWorkflows.find(w => w.id === selectedWorkflowId)) setSelectedWorkflowId(availableWorkflows[0].id);
    } else {
      setSelectedWorkflowId('');
    }
  }, [availableWorkflows, selectedWorkflowId, taskType]);

  useEffect(() => { if (logsEndRef.current) logsEndRef.current.scrollIntoView({ behavior: 'smooth' }); }, [logContent]);

  const stripAnsi = (str: string) => {
    // eslint-disable-next-line
    return str.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
  };

  const handleRun = () => {
    if (taskType === 'PIPELINE' && !selectedSheetId) return toast.error("Please select a sample sheet.");
    if (!selectedWorkflowId) return toast.error("Please select a template.");
    const wf = workflows.find(w => w.id === selectedWorkflowId);
    if (!wf) return;
    runAnalysisMutation.mutate({ project_id: projectId, workflow: wf.script_path, sample_sheet_id: taskType === 'PIPELINE' ? selectedSheetId : null, params_json: JSON.stringify(params) });
  };

  const handleViewLog = (id: string) => {
    setSelectedLogId(id);
    setLogContent('Connecting to Live Log Stream...\n');
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || (window.location.origin + '/api/v1');
    const wsUrl = apiUrl.replace(/^http/, 'ws') + `/workflow/analyses/${id}/ws/log`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    ws.onopen = () => setLogContent(prev => prev + '✅ Connected. Waiting for output...\n\n');
    ws.onmessage = (event) => setLogContent(prev => prev + stripAnsi(event.data));
    ws.onerror = () => setLogContent(prev => prev + '\n[WebSocket Error]\n');
    ws.onclose = () => setLogContent(prev => prev + '\n[Log Stream Closed]\n');
  };

  const closeLogModal = () => {
      if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
      setSelectedLogId(null);
      setLogContent('');
  };

  const handleViewReport = async (id: string) => {
    const loadingToast = toast.loading("Opening report...");
    try {
        const token = localStorage.getItem('token');
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
        const res = await fetch(`${apiUrl}/workflow/analyses/${id}/report`, { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) {
            const blob = await res.blob();
            window.open(window.URL.createObjectURL(blob), '_blank');
            toast.dismiss(loadingToast);
        } else toast.error('Report not found.', { id: loadingToast });
    } catch (e) { toast.error('Error opening report', { id: loadingToast }); }
  };

  const handleDownloadResults = async (id: string) => {
    const loadingToast = toast.loading("Zipping results...");
    try {
        const token = localStorage.getItem('token');
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
        const res = await fetch(`${apiUrl}/workflow/analyses/${id}/download_results`, { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) {
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `results_${id.slice(0,8)}.zip`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
            toast.success("Download started!", { id: loadingToast });
        } else toast.error('Results folder not found or empty.', { id: loadingToast });
    } catch (e) { toast.error('Download failed', { id: loadingToast }); }
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

  if (loadingAnalyses) return <div className="text-gray-500 animate-pulse">Loading analyses...</div>;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div><h3 className="text-xl font-bold text-white">Analysis & Tools</h3><p className="text-gray-400 text-xs mt-1">Run bioinformatics pipelines or standalone tools.</p></div>
        <button onClick={() => setShowRunModal(true)} className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-lg shadow-emerald-900/20 flex items-center gap-2">▶ Run New Task</button>
      </div>

      {showRunModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100] p-4">
            <div className="bg-gray-900 p-6 rounded-xl border border-gray-700 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto flex flex-col">
                <h3 className="text-lg font-bold text-white mb-4 border-b border-gray-800 pb-2">Start a New Task</h3>
                <div className="space-y-6 flex-1">
                    <div className="flex gap-4 p-1 bg-gray-800 rounded-lg">
                        <button className={`flex-1 py-2 text-sm font-bold rounded-md transition-colors ${taskType === 'PIPELINE' ? 'bg-purple-600 text-white shadow-md' : 'text-gray-400 hover:text-white'}`} onClick={() => setTaskType('PIPELINE')}>🔗 Pipeline (流程)</button>
                        <button className={`flex-1 py-2 text-sm font-bold rounded-md transition-colors ${taskType === 'TOOL' ? 'bg-orange-600 text-white shadow-md' : 'text-gray-400 hover:text-white'}`} onClick={() => setTaskType('TOOL')}>🛠️ Tool (工具)</button>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">1. Select {taskType === 'PIPELINE' ? 'Pipeline' : 'Tool'}</label>
                        {availableWorkflows.length > 0 ? (
                            <select className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white outline-none focus:border-blue-500" value={selectedWorkflowId} onChange={(e) => setSelectedWorkflowId(e.target.value)}>
                                {availableWorkflows.map(w => <option key={w.id} value={w.id}>{w.category} / {w.name}</option>)}
                            </select>
                        ) : <div className="text-red-400 text-sm bg-red-900/20 p-2 rounded">No {taskType.toLowerCase()}s available.</div>}
                    </div>

                    {taskType === 'PIPELINE' && (
                        <div>
                            <label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">2. Select Sample Sheet</label>
                            {sheets.length > 0 ? (
                                <select className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white outline-none focus:border-purple-500" value={selectedSheetId} onChange={(e) => setSelectedSheetId(e.target.value)}>
                                    {sheets.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                </select>
                            ) : <div className="text-yellow-500 text-sm bg-yellow-900/20 p-2 rounded">No sample sheets found.</div>}
                        </div>
                    )}

                    <div>
                        <label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">{taskType === 'PIPELINE' ? '3' : '2'}. Configure Parameters</label>
                        <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700 max-h-64 overflow-y-auto">
                            {currentWorkflow ? (
                                <DynamicParamsForm schemaStr={currentWorkflow.params_schema} onChange={(vals) => setParams(vals)} uploadedFiles={files} projectId={projectId} />
                            ) : <div className="text-gray-500 text-sm">Select a template to configure parameters.</div>}
                        </div>
                    </div>
                </div>

                <div className="flex justify-end gap-3 mt-8 pt-4 border-t border-gray-800">
                    <button onClick={() => setShowRunModal(false)} className="text-gray-400 hover:text-white text-sm px-3 py-2">Cancel</button>
                    <button onClick={handleRun} disabled={runAnalysisMutation.isPending || availableWorkflows.length === 0 || (taskType === 'PIPELINE' && sheets.length === 0)} className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-2 rounded-lg text-sm font-medium shadow-lg shadow-emerald-900/20 disabled:opacity-50 transition-all">
                        {runAnalysisMutation.isPending ? 'Submitting...' : '🚀 Launch Task'}
                    </button>
                </div>
            </div>
        </div>
      )}

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden mb-8 shadow-xl">
        <table className="w-full text-left">
          <thead className="bg-gray-800/50 text-gray-400 text-xs uppercase">
            <tr><th className="px-6 py-3 font-medium">ID</th><th className="px-6 py-3 font-medium">Task / Pipeline</th><th className="px-6 py-3 font-medium">Status</th><th className="px-6 py-3 font-medium">Date</th><th className="px-6 py-3 font-medium text-right">Actions</th></tr>
          </thead>
          <tbody className="divide-y divide-gray-800 text-sm">
            {analyses.map((a) => (
              <tr key={a.id} className="hover:bg-gray-800/30 text-gray-300 transition-colors">
                <td className="px-6 py-4 font-mono text-xs text-gray-500">{a.id.slice(0, 8)}...</td>
                <td className="px-6 py-4 font-medium text-white">{a.workflow}</td>
                <td className="px-6 py-4"><span className={`px-2 py-1 rounded-full text-[10px] font-bold border ${getStatusColor(a.status)} uppercase tracking-wide`}>{a.status}</span></td>
                <td className="px-6 py-4 text-gray-500">{new Date(a.start_time).toLocaleString()}</td>
                <td className="px-6 py-4 text-right">
                    <button onClick={() => handleViewLog(a.id)} className="text-blue-400 hover:text-blue-300 mr-4 font-medium">Logs</button>
                    {a.status === 'completed' && (
                        <>
                            <button onClick={() => handleViewReport(a.id)} className="text-emerald-400 hover:text-emerald-300 font-medium mr-4">Report</button>
                            <button onClick={() => handleDownloadResults(a.id)} className="text-purple-400 hover:text-purple-300 font-medium">Download</button>
                        </>
                    )}
                </td>
              </tr>
            ))}
            {analyses.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-gray-500">No tasks running yet.</td></tr>}
          </tbody>
        </table>
      </div>
      
      {selectedLogId && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100] p-8 animate-in fade-in duration-200">
            <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-5xl h-[85vh] flex flex-col shadow-2xl overflow-hidden">
                <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-gray-800/50">
                    <div className="flex items-center gap-3">
                        <h3 className="font-mono text-sm text-blue-400 font-bold">Execution Log</h3>
                        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-emerald-900/30 border border-emerald-800/50">
                            <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span><span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span></span>
                            <span className="text-[10px] text-emerald-400 uppercase tracking-widest font-bold">Live</span>
                        </div>
                    </div>
                    <button onClick={closeLogModal} className="text-gray-400 hover:text-white p-1.5 hover:bg-gray-700 rounded transition-colors">✕</button>
                </div>
                <div className="flex-1 p-4 overflow-y-auto bg-[#0d1117]">
                    <pre className="text-xs text-gray-300 font-mono whitespace-pre-wrap leading-relaxed break-words">{logContent}</pre>
                    <div ref={logsEndRef} />
                </div>
            </div>
        </div>
      )}
    </div>
  );
}