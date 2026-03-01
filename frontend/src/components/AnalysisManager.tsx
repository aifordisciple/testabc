'use client';

import { useState, useEffect, useRef } from 'react';
import { toast } from '@/components/ui/Toast';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import DynamicParamsForm from './DynamicParamsForm';
import { Search, Save, Info, Play, FileText, Download, Trash2, Square, CheckCircle2, XCircle, Clock, RefreshCw, FlaskConical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface Analysis { id: string; workflow: string; status: string; start_time: string; end_time?: string; sample_sheet_id?: string; }
interface SampleSheet { id: string; name: string; }
interface ProjectFile { id: string; filename: string; s3_key: string; is_directory: boolean; }
interface WorkflowTemplate { id: string; name: string; category: string; script_path: string; params_schema: string; workflow_type: string; }

interface AnalysisManagerProps { projectId: string; isActive?: boolean; }

interface SaveTemplateState {
  isOpen: boolean;
  analysisId: string | null;
  analysisWorkflow: string;
  name: string;
  description: string;
  category: string;
  makePublic: boolean;
}

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
  
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;
  
  const [saveTemplateState, setSaveTemplateState] = useState<SaveTemplateState>({
    isOpen: false,
    analysisId: null,
    analysisWorkflow: '',
    name: '',
    description: '',
    category: '',
    makePublic: false
  });

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

  const handleStopAnalysis = async (id: string) => {
    if (!confirm('Are you sure you want to stop this task?')) return;
    const loadingToast = toast.loading("Stopping task...");
    try {
      const token = localStorage.getItem('token');
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
      const res = await fetch(`${apiUrl}/workflow/analyses/${id}/stop`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        toast.success("Task stopped successfully!", { id: loadingToast });
        queryClient.invalidateQueries({ queryKey: ['analyses', projectId] });
      } else {
        const err = await res.json();
        toast.error(err.detail || 'Failed to stop task', { id: loadingToast });
      }
    } catch (e) {
      toast.error('Failed to stop task', { id: loadingToast });
    }
  };

  const handleDeleteAnalysis = async (id: string) => {
    if (!confirm('Are you sure you want to delete this task? This action cannot be undone.')) return;
    const loadingToast = toast.loading("Deleting task...");
    try {
      const token = localStorage.getItem('token');
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
      const res = await fetch(`${apiUrl}/workflow/analyses/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        toast.success("Task deleted successfully!", { id: loadingToast });
        queryClient.invalidateQueries({ queryKey: ['analyses', projectId] });
      } else {
        const err = await res.json();
        toast.error(err.detail || 'Failed to delete task', { id: loadingToast });
      }
    } catch (e) {
      toast.error('Failed to delete task', { id: loadingToast });
    }
  };

  const handleOpenSaveTemplate = async (analysis: Analysis) => {
    const canSave = analysis.status === 'completed' && analysis.workflow === 'custom_sandbox_analysis';
    if (!canSave) {
      toast.error('Only completed custom sandbox analyses can be saved as templates');
      return;
    }
    
    setSaveTemplateState({
      isOpen: true,
      analysisId: analysis.id,
      analysisWorkflow: analysis.workflow,
      name: `My Analysis Tool - ${new Date().toLocaleDateString()}`,
      description: '',
      category: 'Custom Analysis',
      makePublic: false
    });
  };

  const handleSaveTemplate = async () => {
    if (!saveTemplateState.analysisId || !saveTemplateState.name.trim()) {
      toast.error('Please provide a name for the template');
      return;
    }
    
    const loadingToast = toast.loading('Saving as template...');
    try {
      const token = localStorage.getItem('token');
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
      const res = await fetch(`${apiUrl}/ai/projects/${projectId}/chat/save-template`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json', 
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify({
          analysis_id: saveTemplateState.analysisId,
          name: saveTemplateState.name,
          description: saveTemplateState.description,
          category: saveTemplateState.category,
          make_public: saveTemplateState.makePublic
        })
      });
      
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Failed to save template');
      }
      
      const data = await res.json();
      toast.success(data.message || 'Template saved successfully!', { id: loadingToast });
      setSaveTemplateState(prev => ({ ...prev, isOpen: false }));
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
    } catch (e: any) {
      toast.error(e.message || 'Failed to save template', { id: loadingToast });
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
        case 'completed': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
        case 'failed': return 'bg-red-500/10 text-red-400 border-red-500/20';
        case 'stopped': return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20';
        case 'running': return 'bg-blue-500/10 text-blue-400 border-blue-500/20 animate-pulse';
        default: return 'bg-muted text-muted-foreground';
    }
  };

  const filteredAnalyses = analyses.filter(a => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      a.workflow.toLowerCase().includes(query) ||
      a.status.toLowerCase().includes(query) ||
      a.id.toLowerCase().includes(query)
    );
  });

  const totalPages = Math.ceil(filteredAnalyses.length / pageSize);
  const paginatedAnalyses = filteredAnalyses.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(totalPages);
    }
  }, [filteredAnalyses.length, totalPages, currentPage]);

  const currentWorkflow = workflows.find(w => w.id === selectedWorkflowId);

  if (loadingAnalyses) return (
    <div className="p-6 space-y-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-64 w-full" />
      <Skeleton className="h-12 w-full" />
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-xl font-bold text-foreground">Analysis & Tools</h3>
          <p className="text-sm text-muted-foreground mt-1">Run bioinformatics pipelines or standalone tools.</p>
        </div>
        <Button onClick={() => setShowRunModal(true)} className="gap-2">
          <Play className="w-4 h-4" />
          Run New Task
        </Button>
      </div>

      {showRunModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100] p-4">
            <Card className="w-full max-w-lg max-h-[90vh] overflow-y-auto">
                <CardContent className="p-6 space-y-6">
                    <div className="flex items-center justify-between pb-4 border-b">
                      <h3 className="text-lg font-bold text-foreground">Start a New Task</h3>
                    </div>
                    <div className="flex gap-2 p-1 bg-muted rounded-lg">
                        <Button 
                          variant={taskType === 'PIPELINE' ? 'default' : 'ghost'} 
                          size="sm"
                          className="flex-1"
                          onClick={() => setTaskType('PIPELINE')}
                        >
                          🔗 Pipeline
                        </Button>
                        <Button 
                          variant={taskType === 'TOOL' ? 'default' : 'ghost'} 
                          size="sm"
                          className="flex-1"
                          onClick={() => setTaskType('TOOL')}
                        >
                          🛠️ Tool
                        </Button>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground">
                          1. Select {taskType === 'PIPELINE' ? 'Pipeline' : 'Tool'}
                        </label>
                        {availableWorkflows.length > 0 ? (
                            <select 
                              className="w-full bg-background border border-input rounded-lg px-3 py-2 text-foreground outline-none focus:border-primary" 
                              value={selectedWorkflowId} 
                              onChange={(e) => setSelectedWorkflowId(e.target.value)}
                            >
                                {availableWorkflows.map(w => <option key={w.id} value={w.id}>{w.category} / {w.name}</option>)}
                            </select>
                        ) : <div className="text-destructive text-sm bg-destructive/10 p-2 rounded-lg">No {taskType.toLowerCase()}s available.</div>}
                    </div>

                    {taskType === 'PIPELINE' && (
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-foreground">2. Select Sample Sheet</label>
                            {sheets.length > 0 ? (
                                <select 
                                  className="w-full bg-background border border-input rounded-lg px-3 py-2 text-foreground outline-none focus:border-primary" 
                                  value={selectedSheetId} 
                                  onChange={(e) => setSelectedSheetId(e.target.value)}
                                >
                                    {sheets.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                </select>
                            ) : <div className="text-yellow-500 text-sm bg-yellow-500/10 p-2 rounded-lg">No sample sheets found.</div>}
                        </div>
                    )}

                    <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground">
                          {taskType === 'PIPELINE' ? '3' : '2'}. Configure Parameters
                        </label>
                        <div className="bg-muted/50 rounded-lg p-4 border border-border max-h-64 overflow-y-auto">
                            {currentWorkflow ? (
                                <DynamicParamsForm schemaStr={currentWorkflow.params_schema} onChange={(vals) => setParams(vals)} uploadedFiles={files} projectId={projectId} />
                            ) : <div className="text-muted-foreground text-sm">Select a template to configure parameters.</div>}
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-4 border-t">
                        <Button variant="ghost" onClick={() => setShowRunModal(false)}>Cancel</Button>
                        <Button 
                          onClick={handleRun} 
                          disabled={runAnalysisMutation.isPending || availableWorkflows.length === 0 || (taskType === 'PIPELINE' && sheets.length === 0)}
                          className="gap-2"
                        >
                          {runAnalysisMutation.isPending ? 'Submitting...' : <>🚀 Launch Task</>}
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
      )}

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <div className="p-4 border-b border-border flex items-center justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search by task name, status, ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="text-sm text-muted-foreground">
              {filteredAnalyses.length} task{filteredAnalyses.length !== 1 ? 's' : ''}
              {searchQuery && ` matching "${searchQuery}"`}
            </div>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-muted/50 text-muted-foreground text-xs uppercase sticky top-0">
                <tr>
                  <th className="px-3 py-2.5 font-medium">ID</th>
                  <th className="px-3 py-2.5 font-medium">Task / Pipeline</th>
                  <th className="px-3 py-2.5 font-medium">Status</th>
                  <th className="px-3 py-2.5 font-medium">Date</th>
                  <th className="px-3 py-2.5 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {paginatedAnalyses.map((a) => (
                  <tr key={a.id} className="hover:bg-muted/50 transition-colors group">
                    <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">{a.id.slice(0, 8)}...</td>
                    <td className="px-3 py-2.5 font-medium text-foreground text-sm">{a.workflow}</td>
                    <td className="px-3 py-2.5">
                      <Badge variant="outline" className={cn("text-xs", getStatusColor(a.status))}>
                        {a.status}
                      </Badge>
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground text-xs">{new Date(a.start_time).toLocaleString()}</td>
                    <td className="px-3 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" className="h-7 px-1.5" onClick={() => handleViewLog(a.id)}>
                          <FileText className="w-3.5 h-3.5" />
                        </Button>
                        {(a.status === 'pending' || a.status === 'running') && (
                          <Button variant="ghost" size="sm" className="h-7 px-1.5 text-yellow-500 hover:text-yellow-400" onClick={() => handleStopAnalysis(a.id)}>
                            <Square className="w-3.5 h-3.5" />
                          </Button>
                        )}
                        {a.status === 'completed' && (
                          <>
                            <Button variant="ghost" size="sm" className="h-7 px-1.5" onClick={() => handleViewReport(a.id)}>
                              <FileText className="w-3.5 h-3.5" />
                            </Button>
                            <Button variant="ghost" size="sm" className="h-7 px-1.5" onClick={() => handleDownloadResults(a.id)}>
                              <Download className="w-3.5 h-3.5" />
                            </Button>
                            {a.workflow === 'custom_sandbox_analysis' && (
                              <Button variant="ghost" size="sm" className="h-7 px-1.5 text-orange-500 hover:text-orange-400" onClick={() => handleOpenSaveTemplate(a)}>
                                <Save className="w-3.5 h-3.5" />
                              </Button>
                            )}
                          </>
                        )}
                        {a.status !== 'pending' && a.status !== 'running' && (
                          <Button variant="ghost" size="sm" className="h-7 px-1.5 text-destructive hover:text-destructive" onClick={() => handleDeleteAnalysis(a.id)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {paginatedAnalyses.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-muted-foreground">
                      {searchQuery ? 'No tasks match your search.' : 'No tasks running yet.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        
          {totalPages > 1 && (
            <div className="p-4 border-t border-border flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                Page {currentPage} of {totalPages}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  ← Prev
                </Button>
                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum: number;
                    if (totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (currentPage <= 3) {
                      pageNum = i + 1;
                    } else if (currentPage >= totalPages - 2) {
                      pageNum = totalPages - 4 + i;
                    } else {
                      pageNum = currentPage - 2 + i;
                    }
                    return (
                      <Button
                        key={pageNum}
                        variant={currentPage === pageNum ? 'default' : 'ghost'}
                        size="sm"
                        onClick={() => setCurrentPage(pageNum)}
                      >
                        {pageNum}
                      </Button>
                    );
                  })}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                >
                  Next →
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      
      {selectedLogId && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100] p-8 animate-in fade-in duration-200">
            <Card className="w-full max-w-5xl h-[85vh] flex flex-col">
                <div className="p-4 border-b border-border flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <h3 className="font-mono text-sm text-blue-400 font-bold">Execution Log</h3>
                        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/20">
                            <span className="relative flex h-2 w-2">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                            </span>
                            <span className="text-[10px] text-emerald-400 uppercase tracking-widest font-bold">Live</span>
                        </div>
                    </div>
                    <Button variant="ghost" size="icon" onClick={closeLogModal}>✕</Button>
                </div>
                <div className="flex-1 p-4 overflow-y-auto bg-card">
                    <pre className="text-xs text-foreground font-mono whitespace-pre-wrap leading-relaxed break-words">{logContent}</pre>
                    <div ref={logsEndRef} />
                </div>
            </Card>
        </div>
      )}
      
      {saveTemplateState.isOpen && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100] p-4 animate-in fade-in duration-200">
          <Card className="w-full max-w-lg">
            <CardContent className="p-0">
              <div className="p-4 border-b border-border bg-gradient-to-r from-orange-500/10 to-amber-500/10">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-orange-500/20 flex items-center justify-center">
                      <Save className="w-5 h-5 text-orange-500" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-foreground">Save as Reusable Tool</h3>
                      <p className="text-xs text-orange-500">Create a template from this analysis</p>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => setSaveTemplateState(prev => ({ ...prev, isOpen: false }))}>✕</Button>
                </div>
              </div>
              
              <div className="p-6 space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">
                    Tool Name <span className="text-destructive">*</span>
                  </label>
                  <Input
                    type="text"
                    value={saveTemplateState.name}
                    onChange={(e) => setSaveTemplateState(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Enter a descriptive name"
                  />
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Description</label>
                  <textarea
                    value={saveTemplateState.description}
                    onChange={(e) => setSaveTemplateState(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Describe what this tool does..."
                    rows={3}
                    className="w-full bg-background border border-input rounded-lg px-3 py-2 text-foreground outline-none focus:border-primary transition-colors resize-none"
                  />
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Category</label>
                  <select
                    value={saveTemplateState.category}
                    onChange={(e) => setSaveTemplateState(prev => ({ ...prev, category: e.target.value }))}
                    className="w-full bg-background border border-input rounded-lg px-3 py-2 text-foreground outline-none focus:border-primary transition-colors"
                  >
                    <option value="Custom Analysis">Custom Analysis</option>
                    <option value="Data Visualization">Data Visualization</option>
                    <option value="Statistical Analysis">Statistical Analysis</option>
                    <option value="Quality Control">Quality Control</option>
                    <option value="Data Processing">Data Processing</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                
                <div className="bg-muted/50 rounded-lg p-4 border border-border">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={saveTemplateState.makePublic}
                      onChange={(e) => setSaveTemplateState(prev => ({ ...prev, makePublic: e.target.checked }))}
                      className="mt-1 w-4 h-4 rounded border-input bg-background text-orange-500 focus:ring-orange-500"
                    />
                    <div>
                      <span className="text-foreground text-sm font-medium">Make public for other users</span>
                      <p className="text-xs text-muted-foreground mt-1">
                        {saveTemplateState.makePublic 
                          ? 'This tool will be submitted for review and made available to all users after approval.' 
                          : 'The tool will be private to your account only.'}
                      </p>
                    </div>
                  </label>
                </div>
                
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
                  <div className="flex items-start gap-2">
                    <Info className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-blue-400">
                      The tool's parameters will be automatically extracted from your code using AI analysis.
                    </p>
                  </div>
                </div>
              </div>
              
              <div className="flex justify-end gap-3 p-4 border-t border-border bg-muted/30">
                <Button variant="ghost" onClick={() => setSaveTemplateState(prev => ({ ...prev, isOpen: false }))}>
                  Cancel
                </Button>
                <Button 
                  onClick={handleSaveTemplate}
                  disabled={!saveTemplateState.name.trim()}
                  className="gap-2"
                >
                  <Save className="w-4 h-4" />
                  Save Template
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}