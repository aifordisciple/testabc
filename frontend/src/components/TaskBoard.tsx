'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Search, Play, Square, Trash2, Download, FileText, 
  ChevronRight, Clock, CheckCircle2, XCircle, AlertCircle,
  RefreshCw, Eye, Terminal, LayoutGrid, Table2, ExternalLink
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLocale } from '@/stores/localeStore';

interface Analysis {
  id: string;
  workflow: string;
  status: string;
  start_time: string;
  end_time?: string;
  sample_sheet_id?: string;
  project_id?: string;
}

interface TaskBoardProps {
  onBack?: () => void;
}

const translations = {
  zh: {
    title: '任务中心',
    searchPlaceholder: '搜索任务 ID 或工作流名称...',
    queued: '排队中',
    running: '运行中',
    completed: '已完成',
    failed: '失败',
    stopped: '已停止',
    noTasks: '暂无任务',
    viewLog: '查看日志',
    stop: '停止',
    delete: '删除',
    download: '下载结果',
    report: '报告',
    confirmStop: '确定要停止此任务吗？',
    confirmDelete: '确定要删除此任务吗？此操作不可撤销。',
  },
  en: {
    title: 'Task Center',
    searchPlaceholder: 'Search by task ID or workflow name...',
    queued: 'Queued',
    running: 'Running',
    completed: 'Completed',
    failed: 'Failed',
    stopped: 'Stopped',
    noTasks: 'No tasks',
    viewLog: 'View Log',
    stop: 'Stop',
    delete: 'Delete',
    download: 'Download Results',
    report: 'Report',
    confirmStop: 'Are you sure you want to stop this task?',
    confirmDelete: 'Are you sure you want to delete this task? This action cannot be undone.',
  }
};

const fetchAPI = async (endpoint: string) => {
  const token = localStorage.getItem('token');
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
  const res = await fetch(`${apiUrl}${endpoint}`, { 
    headers: { Authorization: `Bearer ${token}` } 
  });
  if (!res.ok) throw new Error(`API fetch error on ${endpoint}`);
  return res.json();
};

export default function TaskBoard({ onBack }: TaskBoardProps) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const { locale } = useLocale();
  const t = translations[locale];

  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'kanban' | 'table'>('kanban');
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);
  const [logContent, setLogContent] = useState('');
  const wsRef = useRef<WebSocket | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  const { data: analyses = [], isLoading, refetch } = useQuery<Analysis[]>({
    queryKey: ['task-board-analyses'],
    queryFn: () => fetchAPI('/workflow/analyses'),
    refetchInterval: 5000
  });

  const filteredAnalyses = analyses.filter(a => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      a.workflow.toLowerCase().includes(query) ||
      a.id.toLowerCase().includes(query)
    );
  });

  const queuedTasks = filteredAnalyses.filter(a => a.status === 'pending');
  const runningTasks = filteredAnalyses.filter(a => a.status === 'running');
  const completedTasks = filteredAnalyses.filter(a => a.status === 'completed');
  const failedTasks = filteredAnalyses.filter(a => a.status === 'failed' || a.status === 'stopped');

  useEffect(() => { 
    if (logsEndRef.current) logsEndRef.current.scrollIntoView({ behavior: 'smooth' }); 
  }, [logContent]);

  const stripAnsi = (str: string) => {
    return str.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
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

  const handleStopAnalysis = async (id: string) => {
    if (!confirm(t.confirmStop)) return;
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
        queryClient.invalidateQueries({ queryKey: ['task-board-analyses'] });
      } else {
        const err = await res.json();
        toast.error(err.detail || 'Failed to stop task', { id: loadingToast });
      }
    } catch (e) {
      toast.error('Failed to stop task', { id: loadingToast });
    }
  };

  const handleDeleteAnalysis = async (id: string) => {
    if (!confirm(t.confirmDelete)) return;
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
        queryClient.invalidateQueries({ queryKey: ['task-board-analyses'] });
      } else {
        const err = await res.json();
        toast.error(err.detail || 'Failed to delete task', { id: loadingToast });
      }
    } catch (e) {
      toast.error('Failed to delete task', { id: loadingToast });
    }
  };

  const handleDownloadResults = async (id: string) => {
    const loadingToast = toast.loading("Zipping results...");
    try {
      const token = localStorage.getItem('token');
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
      const res = await fetch(`${apiUrl}/workflow/analyses/${id}/download_results`, { 
        headers: { Authorization: `Bearer ${token}` } 
      });
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

  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'pending':
        return { 
          color: 'bg-yellow-500/20 border-yellow-500/40 text-yellow-400',
          icon: Clock,
          label: t.queued
        };
      case 'running':
        return { 
          color: 'bg-blue-500/20 border-blue-500/40 text-blue-400',
          icon: RefreshCw,
          label: t.running,
          animate: true
        };
      case 'completed':
        return { 
          color: 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400',
          icon: CheckCircle2,
          label: t.completed
        };
      case 'failed':
        return { 
          color: 'bg-red-500/20 border-red-500/40 text-red-400',
          icon: XCircle,
          label: t.failed
        };
      case 'stopped':
        return { 
          color: 'bg-gray-500/20 border-gray-500/40 text-gray-400',
          icon: AlertCircle,
          label: t.stopped
        };
      default:
        return { 
          color: 'bg-gray-500/20 border-gray-500/40 text-gray-400',
          icon: Clock,
          label: status
        };
    }
  };

  const TaskCard = ({ task }: { task: Analysis }) => {
    const statusConfig = getStatusConfig(task.status);
    const StatusIcon = statusConfig.icon;

    return (
      <div className="bg-card rounded-lg border border-border p-3 md:p-4 hover:border-primary/50 transition-colors group">
        <div className="flex items-start justify-between mb-2 md:mb-3">
          <div className="flex items-center gap-2">
            <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium border flex items-center gap-1", statusConfig.color)}>
              <StatusIcon className={cn("w-2.5 md:w-3 h-2.5 md:h-3", statusConfig.animate && "animate-spin")} />
              {statusConfig.label}
            </span>
          </div>
          <div className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity flex gap-0.5 md:gap-1">
            <button
              onClick={() => handleViewLog(task.id)}
              className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground touch-target-min"
              title={t.viewLog}
              aria-label={t.viewLog}
            >
              <Terminal className="w-3.5 md:w-4 h-3.5 md:h-4" />
            </button>
            {(task.status === 'pending' || task.status === 'running') && (
              <button
                onClick={() => handleStopAnalysis(task.id)}
                className="p-1.5 rounded hover:bg-yellow-500/20 text-muted-foreground hover:text-yellow-400 touch-target-min"
                title={t.stop}
                aria-label={t.stop}
              >
                <Square className="w-3.5 md:w-4 h-3.5 md:h-4" />
              </button>
            )}
            {task.status === 'completed' && (
              <button
                onClick={() => handleDownloadResults(task.id)}
                className="p-1.5 rounded hover:bg-emerald-500/20 text-muted-foreground hover:text-emerald-400 touch-target-min"
                title={t.download}
                aria-label={t.download}
              >
                <Download className="w-3.5 md:w-4 h-3.5 md:h-4" />
              </button>
            )}
            {task.status !== 'pending' && task.status !== 'running' && (
              <button
                onClick={() => handleDeleteAnalysis(task.id)}
                className="p-1.5 rounded hover:bg-red-500/20 text-muted-foreground hover:text-red-400 touch-target-min"
                title={t.delete}
                aria-label={t.delete}
              >
                <Trash2 className="w-3.5 md:w-4 h-3.5 md:h-4" />
              </button>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-2 md:gap-3 mb-2 md:mb-3">
          <div className="p-1.5 md:p-2 rounded-lg bg-primary/10 flex-shrink-0">
            <FileText className="w-3.5 md:w-4 h-3.5 md:h-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm truncate">{task.workflow}</p>
            <p className="text-xs text-muted-foreground font-mono">{task.id.slice(0, 8)}...</p>
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{new Date(task.start_time).toLocaleString()}</span>
          {task.end_time && (
            <span>
              {Math.round((new Date(task.end_time).getTime() - new Date(task.start_time).getTime()) / 60000)}min
            </span>
          )}
        </div>
      </div>
    );
  };

  const Column = ({ title, tasks, color }: { title: string, tasks: Analysis[], color: string }) => (
    <div className="flex-1 min-w-[200px] sm:min-w-[250px] md:min-w-[280px] max-w-[300px] md:max-w-[350px] flex flex-col">
      <div className={cn("flex items-center justify-between mb-3 md:mb-4 pb-2 md:pb-3 border-b-2", color)}>
        <h3 className="font-semibold flex items-center gap-2 text-sm md:text-base">
          {title}
          <span className="bg-muted text-muted-foreground text-xs px-1.5 md:px-2 py-0.5 rounded-full">
            {tasks.length}
          </span>
        </h3>
      </div>
      <div className="flex-1 overflow-y-auto space-y-2 md:space-y-3 pr-1 md:pr-2">
        {isLoading ? (
          [1, 2, 3].map(i => (
            <Skeleton key={i} className="h-28 md:h-32 rounded-lg" />
          ))
        ) : tasks.length === 0 ? (
          <div className="text-center py-6 md:py-8 text-muted-foreground text-xs md:text-sm">
            {t.noTasks}
          </div>
        ) : (
          tasks.map(task => <TaskCard key={task.id} task={task} />)
        )}
      </div>
    </div>
  );

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4 md:mb-6 pb-3 md:pb-4 border-b border-border">
        <div>
          <h2 className="text-lg md:text-xl font-bold flex items-center gap-2">
            {t.title}
          </h2>
          <p className="text-xs md:text-sm text-muted-foreground mt-0.5 md:mt-1">
            {analyses.length} {locale === 'zh' ? '个任务' : 'tasks total'}
          </p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:flex-none sm:w-56 md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder={t.searchPlaceholder}
              className="w-full pl-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <Button variant="outline" size="icon" onClick={() => refetch()} className="flex-shrink-0 touch-target-min">
            <RefreshCw className="w-4 h-4" />
          </Button>
          <div className="flex border rounded-lg overflow-hidden">
            <Button variant={viewMode === 'kanban' ? 'default' : 'ghost'} size="icon" className="h-8 w-8 rounded-none" onClick={() => setViewMode('kanban')}>
              <LayoutGrid className="w-4 h-4" />
            </Button>
            <Button variant={viewMode === 'table' ? 'default' : 'ghost'} size="icon" className="h-8 w-8 rounded-none" onClick={() => setViewMode('table')}>
              <Table2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {viewMode === 'kanban' ? (
        <div className="flex-1 flex gap-3 md:gap-6 overflow-x-auto pb-3 md:pb-4 horizontal-scroll">
        <Column 
          title={t.queued} 
          tasks={queuedTasks} 
          color="border-yellow-500" 
        />
        <Column 
          title={t.running} 
          tasks={runningTasks} 
          color="border-blue-500" 
        />
        <Column 
          title={t.completed} 
          tasks={completedTasks} 
          color="border-emerald-500" 
        />
        <Column 
          title={t.failed} 
          tasks={failedTasks} 
          color="border-red-500" 
        />
      </div>

      ) : (
        <div className="flex-1 overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card border-b">
              <tr>
                <th className="text-left p-3 font-medium">Status</th>
                <th className="text-left p-3 font-medium">Workflow</th>
                <th className="text-left p-3 font-medium">Task ID</th>
                <th className="text-left p-3 font-medium">Start Time</th>
                <th className="text-left p-3 font-medium">Duration</th>
                <th className="text-right p-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredAnalyses.map(task => {
                const statusConfig = getStatusConfig(task.status);
                const StatusIcon = statusConfig.icon;
                return (
                  <tr key={task.id} className="border-b hover:bg-accent/50">
                    <td className="p-3">
                      <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium border flex items-center gap-1 w-fit", statusConfig.color)}>
                        <StatusIcon className={cn("w-2.5 h-2.5", statusConfig.animate && "animate-spin")} />
                        {statusConfig.label}
                      </span>
                    </td>
                    <td className="p-3 font-medium">{task.workflow}</td>
                    <td className="p-3 font-mono text-xs text-muted-foreground">{task.id.slice(0, 8)}...</td>
                    <td className="p-3 text-muted-foreground">{new Date(task.start_time).toLocaleString()}</td>
                    <td className="p-3 text-muted-foreground">{task.end_time ? Math.round((new Date(task.end_time).getTime() - new Date(task.start_time).getTime()) / 60000) + 'min' : '-'}</td>
                    <td className="p-3 text-right">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => router.push(`/dashboard/task/${task.id}`)} className="p-1.5 rounded hover:bg-accent" title="Details">
                          <ExternalLink className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => handleViewLog(task.id)} className="p-1.5 rounded hover:bg-accent" title={t.viewLog}>
                          <Terminal className="w-3.5 h-3.5" />
                        </button>
                        {(task.status === 'pending' || task.status === 'running') && (
                          <button onClick={() => handleStopAnalysis(task.id)} className="p-1.5 rounded hover:bg-yellow-500/20 text-yellow-400" title={t.stop}>
                            <Square className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {task.status === 'completed' && (
                          <button onClick={() => handleDownloadResults(task.id)} className="p-1.5 rounded hover:bg-emerald-500/20 text-emerald-400" title={t.download}>
                            <Download className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {task.status !== 'pending' && task.status !== 'running' && (
                          <button onClick={() => handleDeleteAnalysis(task.id)} className="p-1.5 rounded hover:bg-red-500/20 text-red-400" title={t.delete}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Log Modal */}
      {selectedLogId && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100] p-2 md:p-8 animate-in fade-in duration-200">
          <div className="bg-background border border-border rounded-xl w-full h-full md:h-[85vh] md:max-w-5xl flex flex-col shadow-2xl overflow-hidden">
            <div className="p-3 md:p-4 border-b border-border flex justify-between items-center bg-card/50">
              <div className="flex items-center gap-2 md:gap-3">
                <h3 className="font-mono text-xs md:text-sm text-primary font-bold">{locale === 'zh' ? '执行日志' : 'Execution Log'}</h3>
                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-emerald-900/30 border border-emerald-800/50">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                  <span className="text-[10px] text-emerald-400 uppercase tracking-widest font-bold hidden sm:inline">Live</span>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={closeLogModal}>
                <XCircle className="w-4 h-4" />
              </Button>
            </div>
            <div className="flex-1 p-2 md:p-4 overflow-y-auto bg-[#0d1117]">
              <pre className="text-xs text-gray-300 font-mono whitespace-pre-wrap leading-relaxed break-words">
                {logContent}
                <div ref={logsEndRef} />
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
