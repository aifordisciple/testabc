'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { 
  ArrowLeft, Clock, CheckCircle2, XCircle, AlertCircle, RefreshCw,
  Terminal, Download, FileText, FolderOpen, Play, Square, Trash2,
  Copy, Check, ExternalLink, Package
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/components/ui/Toast';
import { useLocale } from '@/stores/localeStore';
import { cn } from '@/lib/utils';

interface AnalysisDetail {
  id: string;
  workflow: string;
  params_json: string;
  status: string;
  sample_sheet_id?: string;
  project_id: string;
  work_dir?: string;
  out_dir?: string;
  start_time: string;
  end_time?: string;
  pid?: number;
  project_name: string;
  project_description?: string;
  sample_sheet_name?: string;
}

interface ResultFile {
  name: string;
  path: string;
  size: number;
  url: string;
}

const translations = {
  zh: {
    back: '返回',
    taskDetail: '任务详情',
    overview: '概览',
    logs: '日志',
    files: '文件',
    parameters: '参数',
    status: '状态',
    workflow: '工作流',
    project: '项目',
    startTime: '开始时间',
    endTime: '结束时间',
    duration: '耗时',
    sampleSheet: '样本表',
    workDir: '工作目录',
    pid: '进程ID',
    queued: '排队中',
    running: '运行中',
    completed: '已完成',
    failed: '失败',
    stopped: '已停止',
    noLogs: '暂无日志',
    noFiles: '暂无文件',
    downloadResults: '下载结果',
    viewReport: '查看报告',
    stop: '停止',
    delete: '删除',
    confirmDelete: '确定要删除此任务吗？',
    copyLog: '复制日志',
    copied: '已复制',
  },
  en: {
    back: 'Back',
    taskDetail: 'Task Detail',
    overview: 'Overview',
    logs: 'Logs',
    files: 'Files',
    parameters: 'Parameters',
    status: 'Status',
    workflow: 'Workflow',
    project: 'Project',
    startTime: 'Start Time',
    endTime: 'End Time',
    duration: 'Duration',
    sampleSheet: 'Sample Sheet',
    workDir: 'Work Directory',
    pid: 'Process ID',
    queued: 'Queued',
    running: 'Running',
    completed: 'Completed',
    failed: 'Failed',
    stopped: 'Stopped',
    noLogs: 'No logs available',
    noFiles: 'No files available',
    downloadResults: 'Download Results',
    viewReport: 'View Report',
    stop: 'Stop',
    delete: 'Delete',
    confirmDelete: 'Are you sure you want to delete this task?',
    copyLog: 'Copy Log',
    copied: 'Copied',
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

export default function TaskDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { locale } = useLocale();
  const t = translations[locale];
  const taskId = params.id as string;
  
  const [logContent, setLogContent] = useState('');
  const [copied, setCopied] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  const { data: detail, isLoading, refetch } = useQuery<AnalysisDetail>({
    queryKey: ['task-detail', taskId],
    queryFn: () => fetchAPI(`/workflow/analyses/${taskId}/detail`),
    enabled: !!taskId
  });

  const { data: files = [] } = useQuery<ResultFile[]>({
    queryKey: ['task-files', taskId],
    queryFn: () => fetchAPI(`/workflow/analyses/${taskId}/files`),
    enabled: !!taskId
  });

  const { data: logData } = useQuery<{ log: string }>({
    queryKey: ['task-log', taskId],
    queryFn: () => fetchAPI(`/workflow/analyses/${taskId}/log`),
    enabled: !!taskId,
    refetchInterval: detail?.status === 'running' ? 3000 : false
  });

  useEffect(() => {
    if (logData?.log) {
      setLogContent(logData.log);
    }
  }, [logData]);

  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logContent]);

  // Connect to WebSocket for live logs
  useEffect(() => {
    if (detail?.status === 'running') {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || (window.location.origin + '/api/v1');
      const wsUrl = apiUrl.replace(/^http/, 'ws') + `/workflow/analyses/${taskId}/ws/log`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      
      ws.onmessage = (event) => {
        setLogContent(prev => prev + event.data);
      };
      
      ws.onerror = () => {};
      ws.onclose = () => {};
      
      return () => {
        if (wsRef.current) wsRef.current.close();
      };
    }
  }, [taskId, detail?.status]);

  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'pending':
        return { color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40', icon: Clock, label: t.queued };
      case 'running':
        return { color: 'bg-blue-500/20 text-blue-400 border-blue-500/40', icon: RefreshCw, label: t.running, animate: true };
      case 'completed':
        return { color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40', icon: CheckCircle2, label: t.completed };
      case 'failed':
        return { color: 'bg-red-500/20 text-red-400 border-red-500/40', icon: XCircle, label: t.failed };
      case 'stopped':
        return { color: 'bg-gray-500/20 text-gray-400 border-gray-500/40', icon: AlertCircle, label: t.stopped };
      default:
        return { color: 'bg-gray-500/20 text-gray-400 border-gray-500/40', icon: Clock, label: status };
    }
  };

  const formatDuration = (start: string, end?: string) => {
    if (!end) return '-';
    const diff = new Date(end).getTime() - new Date(start).getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    return `${minutes}m`;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const stripAnsi = (str: string) => {
    return str.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
  };

  const handleCopyLog = async () => {
    await navigator.clipboard.writeText(logContent);
    setCopied(true);
    toast.success(t.copied);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleStop = async () => {
    const loadingToast = toast.loading("Stopping task...");
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/workflow/analyses/${taskId}/stop`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      if (res.ok) {
        toast.success("Task stopped", { id: loadingToast });
        refetch();
      } else {
        toast.error("Failed to stop task", { id: loadingToast });
      }
    } catch {
      toast.error("Failed to stop task", { id: loadingToast });
    }
  };

  const handleDelete = async () => {
    if (!confirm(t.confirmDelete)) return;
    const loadingToast = toast.loading("Deleting task...");
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/workflow/analyses/${taskId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      if (res.ok) {
        toast.success("Task deleted", { id: loadingToast });
        router.push('/dashboard?tab=tasks');
      } else {
        toast.error("Failed to delete task", { id: loadingToast });
      }
    } catch {
      toast.error("Failed to delete task", { id: loadingToast });
    }
  };

  const handleDownload = async () => {
    const loadingToast = toast.loading("Preparing download...");
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/workflow/analyses/${taskId}/download_results`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `results_${taskId.slice(0, 8)}.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        toast.success("Download started", { id: loadingToast });
      } else {
        toast.error("No results to download", { id: loadingToast });
      }
    } catch {
      toast.error("Download failed", { id: loadingToast });
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="p-6 text-center">
        <p className="text-muted-foreground">Task not found</p>
        <Button onClick={() => router.push('/dashboard?tab=tasks')} className="mt-4">
          {t.back}
        </Button>
      </div>
    );
  }

  const statusConfig = getStatusConfig(detail.status);
  const StatusIcon = statusConfig.icon;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="border-b p-4 flex items-center justify-between bg-card/50">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.push('/dashboard?tab=tasks')}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              {detail.workflow}
              <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium border flex items-center gap-1", statusConfig.color)}>
                <StatusIcon className={cn("w-3 h-3", statusConfig.animate && "animate-spin")} />
                {statusConfig.label}
              </span>
            </h1>
            <p className="text-sm text-muted-foreground font-mono">{taskId.slice(0, 8)}...</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {(detail.status === 'pending' || detail.status === 'running') && (
            <Button variant="outline" size="sm" onClick={handleStop}>
              <Square className="w-4 h-4 mr-1" /> {t.stop}
            </Button>
          )}
          {detail.status === 'completed' && (
            <Button variant="outline" size="sm" onClick={handleDownload}>
              <Download className="w-4 h-4 mr-1" /> {t.downloadResults}
            </Button>
          )}
          {detail.status !== 'pending' && detail.status !== 'running' && (
            <Button variant="outline" size="sm" onClick={handleDelete} className="text-red-500 hover:text-red-600">
              <Trash2 className="w-4 h-4 mr-1" /> {t.delete}
            </Button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        <Tabs defaultValue="overview" className="h-full flex flex-col">
          <TabsList className="mx-4 mt-2">
            <TabsTrigger value="overview">{t.overview}</TabsTrigger>
            <TabsTrigger value="logs">{t.logs}</TabsTrigger>
            <TabsTrigger value="files">{t.files}</TabsTrigger>
            <TabsTrigger value="parameters">{t.parameters}</TabsTrigger>
          </TabsList>

          <ScrollArea className="flex-1">
            <TabsContent value="overview" className="p-4 m-0">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-card border rounded-lg p-4">
                  <h3 className="font-semibold mb-3 flex items-center gap-2">
                    <FileText className="w-4 h-4" /> {t.workflow}
                  </h3>
                  <p className="text-lg font-medium">{detail.workflow}</p>
                </div>
                <div className="bg-card border rounded-lg p-4">
                  <h3 className="font-semibold mb-3 flex items-center gap-2">
                    <FolderOpen className="w-4 h-4" /> {t.project}
                  </h3>
                  <p className="text-lg font-medium">{detail.project_name}</p>
                  {detail.project_description && (
                    <p className="text-sm text-muted-foreground">{detail.project_description}</p>
                  )}
                </div>
                <div className="bg-card border rounded-lg p-4">
                  <h3 className="font-semibold mb-3 flex items-center gap-2">
                    <Clock className="w-4 h-4" /> {t.startTime}
                  </h3>
                  <p>{new Date(detail.start_time).toLocaleString()}</p>
                </div>
                <div className="bg-card border rounded-lg p-4">
                  <h3 className="font-semibold mb-3 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4" /> {t.endTime}
                  </h3>
                  <p>{detail.end_time ? new Date(detail.end_time).toLocaleString() : '-'}</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {t.duration}: {formatDuration(detail.start_time, detail.end_time)}
                  </p>
                </div>
                {detail.sample_sheet_name && (
                  <div className="bg-card border rounded-lg p-4">
                    <h3 className="font-semibold mb-3 flex items-center gap-2">
                      <Package className="w-4 h-4" /> {t.sampleSheet}
                    </h3>
                    <p>{detail.sample_sheet_name}</p>
                  </div>
                )}
                {detail.pid && (
                  <div className="bg-card border rounded-lg p-4">
                    <h3 className="font-semibold mb-3">{t.pid}</h3>
                    <p className="font-mono">{detail.pid}</p>
                  </div>
                )}
                {detail.work_dir && (
                  <div className="bg-card border rounded-lg p-4 md:col-span-2">
                    <h3 className="font-semibold mb-3">{t.workDir}</h3>
                    <p className="text-xs font-mono text-muted-foreground break-all">{detail.work_dir}</p>
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="logs" className="m-0">
              <div className="p-4">
                <div className="flex justify-between items-center mb-2">
                  <h3 className="font-semibold">{t.logs}</h3>
                  <Button variant="outline" size="sm" onClick={handleCopyLog}>
                    {copied ? <Check className="w-4 h-4 mr-1" /> : <Copy className="w-4 h-4 mr-1" />}
                    {copied ? t.copied : t.copyLog}
                  </Button>
                </div>
                <div className="bg-[#0d1117] rounded-lg p-4 max-h-[60vh] overflow-auto">
                  <pre className="text-xs text-gray-300 font-mono whitespace-pre-wrap">
                    {stripAnsi(logContent) || t.noLogs}
                    <div ref={logsEndRef} />
                  </pre>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="files" className="m-0">
              <div className="p-4">
                <h3 className="font-semibold mb-3">{t.files}</h3>
                {files.length === 0 ? (
                  <p className="text-muted-foreground">{t.noFiles}</p>
                ) : (
                  <div className="space-y-2">
                    {files.map((file, idx) => (
                      <div key={idx} className="flex items-center justify-between bg-card border rounded-lg p-3">
                        <div className="flex items-center gap-3">
                          <FileText className="w-4 h-4 text-muted-foreground" />
                          <div>
                            <p className="font-medium text-sm">{file.name}</p>
                            <p className="text-xs text-muted-foreground">{file.path}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">{formatFileSize(file.size)}</span>
                          <Button variant="ghost" size="icon" asChild>
                            <a href={file.url} download>
                              <Download className="w-4 h-4" />
                            </a>
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="parameters" className="m-0">
              <div className="p-4">
                <h3 className="font-semibold mb-3">{t.parameters}</h3>
                <div className="bg-card border rounded-lg p-4">
                  <pre className="text-xs font-mono whitespace-pre-wrap overflow-auto">
                    {JSON.stringify(JSON.parse(detail.params_json || '{}'), null, 2)}
                  </pre>
                </div>
              </div>
            </TabsContent>
          </ScrollArea>
        </Tabs>
      </div>
    </div>
  );
}
