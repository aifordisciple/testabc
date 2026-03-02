'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import ReactMarkdown from 'react-markdown';
import { motion } from 'framer-motion';
import { toast } from '@/components/ui/Toast';
import { useTheme } from '@/stores/themeStore';
import { useLocale } from '@/stores/localeStore';
import { useProjectStore } from '@/stores/projectStore';
import { api } from '@/lib/api';
import { CodeBlock } from '@/components/ui/CodeBlock';
import { 
  FlaskConical, Check, ClipboardCheck, Play, Send, X, Download, 
  Trash2, Plus, FolderOpen, FileText, Activity, Settings,
  PanelLeftClose, PanelLeft, MessageSquare, Sparkles, Upload, Search,
  Edit2, Copy, CheckCircle2, FileDown, ChevronDown, CornerDownLeft, Mic, MicOff, FileUp, BookOpen, Wrench, Database, HelpCircle, Square, Zap, Table, File, ChevronLeft, ChevronRight
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Lightbox } from '@/components/copilot/Lightbox';

interface Project {
  id: string;
  name: string;
  description: string;
  created_at: string;
}

interface Session {
  id: string;
  title: string;
  summary?: string;
  created_at: string;
  updated_at: string;
  message_count: number;
}

interface FileAttachment {
  type: 'image' | 'table' | 'pdf' | 'text' | 'binary';
  name: string;
  data?: string; // base64 for images
  preview?: string; // preview for tables
  url?: string; // download URL
  size?: number;
}

interface Message {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
  created_at?: string;
  plan_data?: string;
  task_id?: string;
  files?: FileAttachment[];
  attachments?: FileAttachment[]; // Same as files
}

interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  description: string;
  supports_streaming: boolean;
  supports_vision: boolean;
  max_tokens: number;
}

const DEFAULT_MODELS: ModelInfo[] = [
  { id: 'qwen2.5-coder:32b', name: 'Qwen 2.5 Coder 32B', provider: 'Ollama', description: 'Code-specialized model', supports_streaming: true, supports_vision: false, max_tokens: 32000 },
  { id: 'llama3.1:70b', name: 'Llama 3.1 70B', provider: 'Ollama', description: 'General purpose model', supports_streaming: true, supports_vision: false, max_tokens: 128000 },
  { id: 'deepseek-r1:70b', name: 'DeepSeek R1 70B', provider: 'Ollama', description: 'Advanced reasoning', supports_streaming: true, supports_vision: false, max_tokens: 64000 },
  { id: 'qwen2.5:72b', name: 'Qwen 2.5 72B', provider: 'Ollama', description: 'Excellent Chinese support', supports_streaming: true, supports_vision: false, max_tokens: 32000 },
];

// Prompt templates
const promptTemplates = [
  { id: 'rnaseq', label: 'RNA-seq 分析', prompt: '帮我分析这个RNA-seq数据' },
  { id: 'literature', label: '文献总结', prompt: '总结这篇文献的主要发现' },
  { id: 'code', label: '代码生成', prompt: '写一个Python脚本处理CSV文件' },
  { id: 'compare', label: '方法比较', prompt: '比较这两种生物信息学方法的优缺点' },
];

// Slash commands
const slashCommands = [
  { id: 'upload', label: '上传文件', description: '上传文件到项目', action: 'navigate', target: '/dashboard?tab=files' },
  { id: 'task', label: '运行任务', description: '运行生物信息学任务', action: 'prompt', prompt: '帮我运行一个' },
  { id: 'search', label: '搜索数据', description: '搜索GEO数据库', action: 'prompt', prompt: '搜索' },
  { id: 'template', label: '使用模板', description: '从模板创建', action: 'prompt', prompt: '' },
];

export default function CopilotPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [streamingContent, setStreamingContent] = useState('');
  const [streamingPlan, setStreamingPlan] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Message editing state
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingMessageContent, setEditingMessageContent] = useState('');
  const [showSavedIndicator, setShowSavedIndicator] = useState(false);
  
  // Slash command state
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [slashFilter, setSlashFilter] = useState('');
  
  // Model selector state
  const [selectedModel, setSelectedModel] = useState<ModelInfo>(DEFAULT_MODELS[0]);
  const [showModelMenu, setShowModelMenu] = useState(false);
  
  // Voice input state
  const [isRecording, setIsRecording] = useState(false);
  const [recognition, setRecognition] = useState<any>(null);
  
  // Pending user message for immediate display
  const [pendingUserMessage, setPendingUserMessage] = useState<string | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const modelMenuRef = useRef<HTMLDivElement>(null);
  const [attachments, setAttachments] = useState<{ file: File; preview?: string }[]>([]);
  
  // Lightbox state
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxImages, setLightboxImages] = useState<{src: string; alt: string}[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  
  const { resolvedTheme } = useTheme();
  const { locale } = useLocale();
  const { currentProject, setCurrentProject } = useProjectStore();
  const isDark = resolvedTheme === 'dark';
  
  // Sessions query
  const { data: sessions = [], refetch: refetchSessions } = useQuery<Session[]>({
    queryKey: ['sessions', selectedProjectId],
    queryFn: () => selectedProjectId ? api.get<Session[]>(`/projects/${selectedProjectId}/conversations`) : Promise.resolve([]),
    enabled: !!selectedProjectId
  });

  // Current session messages query
  const { data: sessionMessages = [], refetch: refetchMessages } = useQuery<Message[]>({
    queryKey: ['session-messages', currentSessionId],
    queryFn: () => currentSessionId ? api.get<Message[]>(`/conversations/${currentSessionId}/messages`) : Promise.resolve([]),
    enabled: !!currentSessionId
  });

  // Create session mutation
  const createSessionMutation = useMutation({
    mutationFn: async (title: string) => {
      if (!selectedProjectId) return null;
      return api.post<Session>(`/projects/${selectedProjectId}/conversations`, { title });
    },
    onSuccess: (data) => {
      if (data) {
        setCurrentSessionId(data.id);
        refetchSessions();
      }
    }
  });

  // Update session mutation
  const updateSessionMutation = useMutation({
    mutationFn: async ({ id, title }: { id: string; title: string }) => {
      return api.put<Session>(`/conversations/${id}`, { title });
    },
    onSuccess: () => {
      refetchSessions();
      setEditingSessionId(null);
      setEditingTitle('');
    }
  });

  // Delete session mutation
  const deleteSessionMutation = useMutation({
    mutationFn: async (id: string) => {
      return api.delete(`/conversations/${id}`);
    },
    onSuccess: () => {
      if (currentSessionId === editingSessionId) {
        setCurrentSessionId(null);
      }
      refetchSessions();
    }
  });

  // Update message mutation
  const updateMessageMutation = useMutation({
    mutationFn: async ({ id, content }: { id: string; content: string }) => {
      return api.put<Message>(`/messages/${id}`, { content });
    },
    onSuccess: () => {
      refetchMessages();
      setEditingMessageId(null);
      setEditingMessageContent('');
    }
  });

  // Delete message mutation
  const deleteMessageMutation = useMutation({
    mutationFn: async (id: string) => {
      return api.delete(`/messages/${id}`);
    },
    onSuccess: () => {
      refetchMessages();
    }
  });

  const { data: projectList = [] } = useQuery<Project[]>({
    queryKey: ['projects'],
    queryFn: () => api.get<Project[]>('/files/projects'),
    enabled: true
  });

  const { data: recentAnalyses = [] } = useQuery({
    queryKey: ['project-analyses', selectedProjectId],
    queryFn: () => selectedProjectId ? api.get(`/workflow/analyses?limit=5`) : Promise.resolve([]),
    enabled: !!selectedProjectId,
    refetchInterval: 10000
  });

  // Initialize
  useEffect(() => {
    if (projectList.length > 0 && !selectedProjectId) {
      setSelectedProjectId(projectList[0].id);
      setCurrentProject(projectList[0]);
    }
  }, [projectList, selectedProjectId, setCurrentProject]);

  // Load session when sessions change
  useEffect(() => {
    if (sessions.length > 0 && !currentSessionId) {
      setCurrentSessionId(sessions[0].id);
    }
  }, [sessions, currentSessionId]);

  // Auto-create session when all sessions are deleted (only after initial load)
  const [sessionsLoaded, setSessionsLoaded] = useState(false);
  
  useEffect(() => {
    if (sessions.length > 0) {
      setSessionsLoaded(true);
    }
  }, [sessions.length]);

  useEffect(() => {
    // Only auto-create when sessions have been loaded and are empty
    if (selectedProjectId && sessionsLoaded && sessions.length === 0 && !currentSessionId && !createSessionMutation.isPending) {
      createSessionMutation.mutate(locale === 'zh' ? '新对话' : 'New Chat');
    }
  }, [selectedProjectId, sessionsLoaded, sessions.length, currentSessionId, createSessionMutation.isPending, locale]);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (sessionMessages?.length || streamingContent) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [sessionMessages?.length, streamingContent]);

  // Filter slash commands
  const filteredCommands = slashCommands.filter(cmd => 
    cmd.label.toLowerCase().includes(slashFilter.toLowerCase()) ||
    cmd.description.toLowerCase().includes(slashFilter.toLowerCase())
  );
  
  // Initialize Speech Recognition
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.lang = 'zh-CN';
        
        recognition.onresult = (event: any) => {
          let transcript = '';
          for (let i = event.resultIndex; i < event.results.length; i++) {
            if (event.results[i].isFinal) {
              transcript += event.results[i][0].transcript;
            }
          }
          if (transcript) {
            setInput(prev => prev + transcript);
          }
        };
        
        recognition.onend = () => setIsRecording(false);
        recognition.onerror = () => setIsRecording(false);
        
        setRecognition(recognition);
      }
    }
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + Enter to send
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        if (input.trim() || attachments.length > 0) {
          e.preventDefault();
          handleSendStream(e as any);
        }
      }
      // Escape to close menus
      if (e.key === 'Escape') {
        setShowSlashMenu(false);
        setShowModelMenu(false);
      }
    };
    
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [input, attachments, isLoading]);
  
  const toggleVoiceInput = () => {
    if (!recognition) return;
    if (isRecording) {
      recognition.stop();
    } else {
      recognition.start();
      setIsRecording(true);
    }
  };

  // Auto-resize textarea
  const adjustTextareaHeight = useCallback(() => {
    const textarea = inputRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      const newHeight = Math.min(textarea.scrollHeight, 200);
      textarea.style.height = `${newHeight}px`;
    }
  }, []);

  // Auto-resize textarea on input change
  useEffect(() => {
    adjustTextareaHeight();
  }, [input, adjustTextareaHeight]);

  // Close model menu on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (modelMenuRef.current && !modelMenuRef.current.contains(event.target as Node)) {
        setShowModelMenu(false);
      }
    };
    if (showModelMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showModelMenu]);

  // Handle file selection
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const newAttachments = files.map(file => ({
      file,
      preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined
    }));
    setAttachments(prev => [...prev, ...newAttachments]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Handle paste events
  const handlePaste = (e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData.items);
    items.forEach(item => {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          setAttachments(prev => [...prev, { file, preview: URL.createObjectURL(file) }]);
        }
      }
    });
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => {
      const newAttachments = [...prev];
      if (newAttachments[index].preview) URL.revokeObjectURL(newAttachments[index].preview);
      newAttachments.splice(index, 1);
      return newAttachments;
    });
  };

  const uploadAttachments = async (): Promise<string[]> => {
    if (attachments.length === 0 || !selectedProjectId) return [];
    const token = localStorage.getItem('token');
    const urls: string[] = [];
    for (const att of attachments) {
      const formData = new FormData();
      formData.append('file', att.file);
      formData.append('project_id', selectedProjectId);
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/files/upload`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
          body: formData
        });
        if (res.ok) { const data = await res.json(); urls.push(data.url || data.file_url || data.path); }
      } catch (err) { console.error('Upload failed:', err); }
    }
    return urls;
  };

  const handleSendStream = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() && attachments.length === 0 || isLoading || !selectedProjectId) return;
    
    // Auto-create session if not exists
    let sessionId = currentSessionId;
    if (!sessionId && selectedProjectId && input.trim()) {
      try {
        const token = localStorage.getItem('token');
        const createRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/ai/projects/${selectedProjectId}/chat/sessions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ title: input.slice(0, 30) })
        });
        if (createRes.ok) {
          const sessionData = await createRes.json();
          sessionId = sessionData.id;
          setCurrentSessionId(sessionId);
          refetchSessions();
        }
      } catch (err) {
        console.error('Failed to create session:', err);
      }
    }
    
    if (!sessionId) return;

    const userMsg = input;
    const attachmentUrls = await uploadAttachments();
    const contentWithAttachments = attachmentUrls.length > 0
      ? `${userMsg}\n\n**Attachments:**\n${attachmentUrls.map(url => `- ${url}`).join('\n')}`
      : userMsg;

    setInput('');
    setAttachments([]);
    setShowSlashMenu(false);
    setIsLoading(true);
    setStreamingContent('');
    setPendingUserMessage(contentWithAttachments);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/ai/projects/${selectedProjectId}/chat/stream`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ 
            message: userMsg, 
            session_id: sessionId || currentSessionId,
            project_id: selectedProjectId
          })
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
        if (response.status === 401) {
          toast.error(locale === 'zh' ? '登录已过期，请重新登录' : 'Session expired. Please login again.');
          router.push('/');
          return;
        }
        throw new Error(errorData.detail || `HTTP error: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let accumulatedContent = '';
      let accumulatedPlan: string | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value, { stream: true });
        const lines = text.split('\n');

        for (const line of lines) {
          if (line && line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              switch (data.type) {
                case 'token':
                  accumulatedContent += data.content;
                  setStreamingContent(accumulatedContent);
                  break;
                case 'plan':
                  accumulatedPlan = data.plan_data;
                  setStreamingPlan(accumulatedPlan);
                  break;
                case 'done':
                  if (currentSessionId) {
                    const newUserMsg = { role: 'user' as const, content: contentWithAttachments, created_at: new Date().toISOString() };
                    const newAssistantMsg = { 
                      role: 'assistant' as const, 
                      content: accumulatedContent || 'Done.', 
                      created_at: new Date().toISOString(),
                      plan_data: data.plan_data || accumulatedPlan
                    };
                    
                    // Update query cache directly to avoid flickering
                    queryClient.setQueryData<Message[]>(['session-messages', currentSessionId], (old: Message[] | undefined) => {
                      return [...(old || []), newUserMsg, newAssistantMsg];
                    });
                  }
                  setStreamingContent('');
                  setPendingUserMessage(null);
                  // Show saved indicator
                  setShowSavedIndicator(true);
                  setTimeout(() => setShowSavedIndicator(false), 2000);
                  break;
                case 'error':
                  const errMsg = data.message || 'An error occurred';
                  toast.error(errMsg);
                  setErrorMessage(errMsg);
                  setStreamingContent('');
                  setPendingUserMessage(null);
                  break;
              }
            } catch {}
          }
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmPlan = async (planDataStr: string) => {
    const toastId = toast.loading(locale === 'zh' ? '正在提交任务...' : 'Submitting task...');
    try {
      const token = localStorage.getItem('token');
      const plan = JSON.parse(planDataStr);
      const planType = plan.type || 'single';
      let endpoint = `${process.env.NEXT_PUBLIC_API_URL}/ai/projects/${selectedProjectId}/chat/execute-plan`;
      if (planType === 'multi') endpoint = `${process.env.NEXT_PUBLIC_API_URL}/ai/projects/${selectedProjectId}/chat/execute-chain`;
      
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ plan_data: plan, session_id: currentSessionId, conversation_id: currentSessionId })
      });
      
      if (!res.ok) throw new Error('Failed');
      
      const result = await res.json();
      toast.success(locale === 'zh' ? '任务已提交！' : 'Task submitted!', { id: toastId });
      
      // Immediately add a task card message to the chat
      if (result.task_link && result.analysis_id) {
        const taskCardMsg = {
          id: `task-${Date.now()}`,
          role: 'assistant' as const,
          content: `🚀 **Task Submitted!**\n\nTask ID: \`${result.analysis_id.substring(0, 8)}\`\n\n[📊 View Task Details](${result.task_link})\n\nI will notify you when it's done!`,
          created_at: new Date().toISOString()
        };
        queryClient.setQueryData<Message[]>(['session-messages', currentSessionId], (old: Message[] | undefined) => {
          return [...(old || []), taskCardMsg];
        });
      }
      
      // Refresh messages to show task link
      refetchMessages();
      
      // Poll for task completion to refresh messages
      let pollCount = 0;
      const pollInterval = setInterval(() => {
        pollCount++;
        refetchMessages();
        // Stop polling after 30 seconds
        // Extended polling to 5 minutes for long-running tasks
        if (pollCount >= 600) {
          clearInterval(pollInterval);
        }
      }, 500);
    } catch (e: any) {
      toast.error(e.message || (locale === 'zh' ? '提交失败' : 'Submission failed'), { id: toastId });
    }
  };

  const handleExport = async () => {
    if (!currentSessionId) return;
    try {
      const data = await api.get<{ content: string; filename: string }>(`/conversations/${currentSessionId}/export?format=markdown`);
      const blob = new Blob([data.content], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = data.filename;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(locale === 'zh' ? '导出成功' : 'Exported successfully');
    } catch (e) {
      toast.error(locale === 'zh' ? '导出失败' : 'Export failed');
    }
  };

  const handleCreateSession = () => {
    if (!selectedProjectId) {
      toast.error(locale === 'zh' ? '请先选择一个项目' : 'Please select a project first');
      return;
    }
    createSessionMutation.mutate(locale === 'zh' ? '新对话' : 'New Chat');
  };

  const handleSelectSession = (sessionId: string) => {
    setCurrentSessionId(sessionId);
  };

  const handleDeleteSession = (sessionId: string) => {
    if (confirm(locale === 'zh' ? '确定删除此对话?' : 'Delete this conversation?')) {
      deleteSessionMutation.mutate(sessionId);
    }
  };

  const handleRenameSession = (sessionId: string) => {
    const session = sessions.find(s => s.id === sessionId);
    if (session) {
      setEditingSessionId(sessionId);
      setEditingTitle(session.title);
    }
  };

  const handleSaveRename = () => {
    if (editingSessionId && editingTitle.trim()) {
      updateSessionMutation.mutate({ id: editingSessionId, title: editingTitle.trim() });
    }
  };

  // Message edit handlers
  const handleEditMessage = (msgId: string, content: string) => {
    setEditingMessageId(msgId);
    setEditingMessageContent(content);
  };

  const handleSaveMessageEdit = () => {
    if (editingMessageId && editingMessageContent.trim()) {
      updateMessageMutation.mutate({ id: editingMessageId, content: editingMessageContent.trim() });
    }
  };

  const handleDeleteMessage = (msgId: string) => {
    if (confirm(locale === 'zh' ? '确定删除此消息?' : 'Delete this message?')) {
      deleteMessageMutation.mutate(msgId);
    }
  };

  // Slash command handlers
  const handleSlashCommand = (cmd: typeof slashCommands[0]) => {
    if (cmd.action === 'navigate' && cmd.target) {
      router.push(cmd.target);
    } else if (cmd.action === 'prompt') {
      setInput(cmd.prompt || '');
      setShowSlashMenu(false);
      inputRef.current?.focus();
    }
  };

  const handleUseTemplate = (prompt: string) => {
    setInput(prompt);
  };

  const renderPlanCard = (planDataStr: string) => {
    let plan;
    try { plan = JSON.parse(planDataStr); } catch { return null; }
    return (
      <div className="mt-2 md:mt-4 bg-card border border-emerald-500/30 rounded-xl md:rounded-2xl p-3 md:p-4">
        <div className="flex items-center gap-2 mb-1 md:mb-2">
          <ClipboardCheck className="w-4 md:w-5 h-4 md:h-5 text-emerald-500" />
          <span className="font-bold text-sm md:text-base">{plan.steps?.length ? `Multi-Step (${plan.steps.length})` : 'Analysis Strategy'}</span>
        </div>
        {plan.strategy && <p className="text-xs md:text-sm mb-2 md:mb-3">{plan.strategy}</p>}
        <Button onClick={() => handleConfirmPlan(planDataStr)} className="w-full gap-2 text-sm md:text-base">
          <Play className="w-3 md:w-4 h-3 md:h-4" /> Execute
        </Button>
      </div>
    );
  };

  const renderMessage = (msg: any, idx: number) => {
    const handleCopy = async () => {
      await navigator.clipboard.writeText(msg.content);
      toast.success(locale === 'zh' ? '已复制' : 'Copied');
    };
    
    const handleFilePreview = (file: FileAttachment) => {
      if (file.type === 'image' && file.data) {
        // Collect all images from this message's attachments for the lightbox
        const imageFiles = msg.files?.filter((f: FileAttachment) => f.type === 'image' && f.data) || [];
        const images = imageFiles.map((f: FileAttachment) => ({
          src: f.data!,
          alt: f.name
        }));
        const clickedIndex = images.findIndex((img: {src: string}) => img.src === file.data);
        
        setLightboxImages(images);
        setLightboxIndex(clickedIndex >= 0 ? clickedIndex : 0);
        setLightboxOpen(true);
      } else if (file.type === 'table' && file.preview) {
        alert(file.preview);
      } else {
        toast.info(locale === 'zh' ? `文件: ${file.name}` : `File: ${file.name}`);
      }
    };
    const isEditing = editingMessageId === msg.id;

    return (
      <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
        <div className={`max-w-[90%] md:max-w-[85%] rounded-2xl px-4 md:px-5 py-3 md:py-4 ${msg.role === 'user' ? 'bg-blue-600 text-white shadow-md' : 'bg-white dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-100 shadow-sm'}`}>
          {isEditing ? (
            <div className="space-y-2">
              <textarea
                value={editingMessageContent}
                onChange={(e) => setEditingMessageContent(e.target.value)}
                className="w-full bg-background border rounded-lg p-2 text-sm"
                rows={3}
                autoFocus
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={handleSaveMessageEdit}>
                  <CheckCircle2 className="w-4 h-4 mr-1" /> {locale === 'zh' ? '保存' : 'Save'}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setEditingMessageId(null)}>
                  {locale === 'zh' ? '取消' : 'Cancel'}
                </Button>
              </div>
            </div>
          ) : (
            <div className={`prose prose-sm max-w-none ${isDark ? 'prose-invert' : ''}`}>
              <ReactMarkdown
                components={{
                  code({ node, inline, className, children, ...props }: any) {
                    const match = /language-(\w+)/.exec(className || '');
                    const code = String(children).replace(/\n$/, '');
                    if (!inline && match) {
                      return <CodeBlock code={code} language={match[1]} />;
                    }
                    return <code className={className} {...props}>{children}</code>;
                  },
                  img({ node, src, alt, ...props }: any) {
                    // Handle base64 images and regular image URLs
                    if (src && (src.startsWith('data:image') || src.startsWith('http') || src.startsWith('/'))) {
                      return (
                        <img 
                          src={src} 
                          alt={alt || 'image'} 
                          className="max-w-full h-auto rounded-lg my-2" 
                          loading="lazy"
                          onError={(e) => {
                            console.error('Image load error:', src?.substring(0, 50));
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                          {...props} 
                        />
                      );
                    }
                    return null;
                  }
                }}
              >
                {msg.content}
              </ReactMarkdown>
            </div>
          )}
          {msg.plan_data && renderPlanCard(msg.plan_data)}
          
          {/* Files/Attachments display */}
          {msg.files && msg.files.length > 0 && (
            <div className="mt-3 border border-gray-600/50 rounded-lg p-2 bg-gray-800/30">
              <div className="flex items-center gap-2 mb-2">
                <File className="w-4 h-4 text-gray-400" />
                <span className="text-xs font-medium text-gray-400">
                  {locale === 'zh' ? '附件' : 'Attachments'} ({msg.files.length})
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                {msg.files.map((file: FileAttachment, idx: number) => (
                  <div 
                    key={idx} 
                    className="bg-gray-700/50 rounded-lg overflow-hidden group hover:bg-gray-600 cursor-pointer transition-all"
                    onClick={() => handleFilePreview(file)}
                  >
                    {file.type === 'image' && file.data ? (
                      <img
                        src={file.data}
                        alt={file.name}
                        className="max-w-full h-20 object-cover cursor-pointer"
                      />
                    ) : file.type === 'pdf' ? (
                      <div className="flex items-center justify-center p-2 bg-red-500/20 rounded-lg h-20">
                        <File className="w-4 h-4 text-red-400" />
                        <span className="text-xs text-red-400 ml-1 truncate">{file.name}</span>
                      </div>
                    ) : file.type === 'table' ? (
                      <div className="flex items-center justify-center p-2 bg-green-500/20 rounded-lg h-20">
                        <Table className="w-4 h-4 text-green-400" />
                        <span className="text-xs text-gray-400 ml-1 truncate">{file.name}</span>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center p-2 bg-gray-500/20 rounded-lg h-20">
                        <File className="w-4 h-4 text-gray-400" />
                        <span className="text-xs text-gray-400 ml-1 truncate">{file.name}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* Timestamp */}
        </div>
      </div>
    );
  };

  // Filter sessions based on search (memoized)
  const filteredSessions = useMemo(() => 
    sessions.filter(s => 
      s.title.toLowerCase().includes(searchQuery.toLowerCase())
    ),
    [sessions, searchQuery]
  );

  return (
    <div className="flex h-screen bg-background">
      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40 md:hidden" onClick={() => setSidebarOpen(false)} />
          <motion.div initial={{ x: -300 }} animate={{ x: 0 }} exit={{ x: -300 }}
            className="fixed md:relative z-50 md:z-0 w-[280px] md:w-[300px] h-full border-r border-border bg-sidebar flex flex-col">
            
            {/* Header */}
            <div className="p-3 md:p-4 border-b flex items-center justify-between">
              <div className="flex items-center gap-2 md:gap-3">
                <div className="w-8 h-8 md:w-9 md:h-9 rounded-lg bg-gradient-to-br from-primary to-blue-600 flex items-center justify-center">
                  <Sparkles className="w-4 h-4 md:w-5 md:h-5 text-white" />
                </div>
                <div>
                  <span className="font-semibold text-sm">Bio-Copilot</span>
                  <p className="text-[10px] md:text-[11px] text-muted-foreground">AI Bioinformatician</p>
                </div>
              </div>
              <button onClick={() => setSidebarOpen(false)} className="md:hidden p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Project Select */}
            <div className="p-2 md:p-3 border-b">
              <label className="text-xs font-medium text-muted-foreground mb-1 md:mb-2 block">项目</label>
              <select 
                className="w-full bg-background border text-foreground text-sm rounded-lg px-2 md:px-3 py-1.5 md:py-2"
                value={selectedProjectId || ''}
                onChange={(e) => { 
                  if (e.target.value === '__new__') {
                    router.push('/dashboard?tab=projects&action=new');
                    return;
                  }
                  const p = projectList.find(x => x.id === e.target.value); 
                  if (p) { 
                    setSelectedProjectId(p.id); 
                    setCurrentProject(p);
                    setCurrentSessionId(null);
                  }
                }}
              >
                {projectList.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                <option value="__new__">+ {locale === 'zh' ? '新建项目' : 'New Project'}</option>
              </select>
            </div>

            {/* Quick Actions / Templates */}
            <div className="p-2 md:p-3 border-b">
              <div className="grid grid-cols-2 gap-1">
                {promptTemplates.map(t => (
                  <button 
                    key={t.id} 
                    onClick={() => handleUseTemplate(t.prompt)}
                    className="text-[10px] md:text-xs p-1.5 md:p-2 rounded-lg border hover:bg-accent text-left truncate"
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Search */}
            <div className="p-2 md:p-3 border-b">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 md:w-4 h-3 md:h-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder={locale === 'zh' ? '搜索对话...' : 'Search...'}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-background border text-foreground text-xs md:text-sm rounded-lg pl-7 pr-2 py-1.5 md:py-2"
                />
              </div>
            </div>

            {/* Sessions */}
            <ScrollArea className="flex-1">
              <div className="p-2">
                <div className="flex items-center justify-between mb-2 px-2">
                  <span className="text-xs font-medium text-muted-foreground">
                    {locale === 'zh' ? '对话历史' : 'Conversations'}
                  </span>
                  <div className="flex gap-1">
                    <button onClick={handleExport} className="p-1 hover:bg-accent rounded" title={locale === 'zh' ? '导出' : 'Export'}>
                      <FileDown className="w-3 md:w-4 h-3 md:h-4" />
                    </button>
                    <button onClick={handleCreateSession} className="p-1 hover:bg-accent rounded">
                      <Plus className="w-3 md:w-4 h-3 md:h-4" />
                    </button>
                  </div>
                </div>
                <div className="space-y-1">
                  {filteredSessions.map(session => (
                    <div key={session.id} className={`group flex items-center gap-2 px-2 py-1.5 md:py-2 rounded-lg text-xs md:text-sm cursor-pointer ${currentSessionId === session.id ? 'bg-primary/15 text-primary' : 'hover:bg-accent'}`}
                      onClick={() => handleSelectSession(session.id)}
                    >
                      {editingSessionId === session.id ? (
                        <div className="flex-1 flex items-center gap-1">
                          <input
                            type="text"
                            value={editingTitle}
                            onChange={(e) => setEditingTitle(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSaveRename()}
                            onBlur={handleSaveRename}
                            className="flex-1 bg-background border rounded px-1 py-0.5 text-xs"
                            autoFocus
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>
                      ) : (
                        <>
                          <MessageSquare className="w-3 md:w-4 h-3 md:h-4 flex-shrink-0" />
                          <span className="flex-1 truncate">{session.title}</span>
                          <div className="hidden group-hover:flex items-center gap-1">
                            <button onClick={(e) => { e.stopPropagation(); handleRenameSession(session.id); }} className="p-1 hover:bg-accent rounded">
                              <Edit2 className="w-3 h-3" />
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); handleDeleteSession(session.id); }} className="p-1 hover:bg-destructive/20 rounded text-destructive">
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                  {filteredSessions.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-4">
                      {locale === 'zh' ? '暂无对话' : 'No conversations'}
                    </p>
                  )}
                </div>
              </div>
            </ScrollArea>

            {/* Nav Links */}
            <div className="p-2 md:p-3 border-t space-y-1">
              <button onClick={() => router.push('/dashboard')} className="w-full flex items-center gap-2 md:gap-3 px-2 md:px-3 py-1.5 md:py-2 rounded-lg text-sm text-muted-foreground hover:bg-accent">
                <FolderOpen className="w-4 md:w-[18px]" /> <span className="text-xs">{locale === 'zh' ? '工作台' : 'Dashboard'}</span>
              </button>
              <button onClick={() => router.push('/dashboard?tab=tasks')} className="w-full flex items-center gap-2 md:gap-3 px-2 md:px-3 py-1.5 md:py-2 rounded-lg text-sm text-muted-foreground hover:bg-accent">
                <Activity className="w-4 md:w-[18px]" /> <span className="text-xs">{locale === 'zh' ? '任务中心' : 'Tasks'}</span>
              </button>
              <button onClick={() => router.push('/dashboard?tab=knowledge')} className="w-full flex items-center gap-2 md:gap-3 px-2 md:px-3 py-1.5 md:py-2 rounded-lg text-sm text-muted-foreground hover:bg-accent">
                <BookOpen className="w-4 md:w-[18px]" /> <span className="text-xs">{locale === 'zh' ? '知识库' : 'Knowledge'}</span>
              </button>
              <button onClick={() => router.push('/admin/workflows')} className="w-full flex items-center gap-2 md:gap-3 px-2 md:px-3 py-1.5 md:py-2 rounded-lg text-sm text-muted-foreground hover:bg-accent">
                <Wrench className="w-4 md:w-[18px]" /> <span className="text-xs">{locale === 'zh' ? '工作流管理' : 'Workflows'}</span>
              </button>
              <button onClick={() => router.push('/dashboard?tab=data')} className="w-full flex items-center gap-2 md:gap-3 px-2 md:px-3 py-1.5 md:py-2 rounded-lg text-sm text-muted-foreground hover:bg-accent">
                <Database className="w-4 md:w-[18px]" /> <span className="text-xs">{locale === 'zh' ? '数据管理' : 'Data'}</span>
              </button>
              <button onClick={() => router.push('/dashboard?tab=help')} className="w-full flex items-center gap-2 md:gap-3 px-2 md:px-3 py-1.5 md:py-2 rounded-lg text-sm text-muted-foreground hover:bg-accent">
                <HelpCircle className="w-4 md:w-[18px]" /> <span className="text-xs">{locale === 'zh' ? '帮助' : 'Help'}</span>
              </button>
            </div>
          </motion.div>
        </>
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="h-12 md:h-14 border-b bg-card/50 flex items-center justify-between px-2 md:px-4 gap-2">
          <div className="flex items-center gap-2 md:gap-3 min-w-0">
            <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(!sidebarOpen)} className="flex-shrink-0">
              {sidebarOpen ? <PanelLeftClose className="w-4 md:w-5 h-4 md:h-5" /> : <PanelLeft className="w-4 md:w-5 h-4 md:h-5" />}
            </Button>
            <h3 className="font-bold text-sm md:text-base truncate">
              {currentSessionId ? sessions.find(s => s.id === currentSessionId)?.title || 'Chat' : 'Bio-Copilot'}
            </h3>
            {selectedProjectId && <Badge variant="outline" className="hidden sm:inline-flex text-xs">{projectList.find(p => p.id === selectedProjectId)?.name}</Badge>}
          </div>
          <div className="flex items-center gap-1 md:gap-2">
            <Button variant="outline" size="sm" onClick={handleExport} className="text-xs md:text-sm h-8 md:h-9" title={locale === 'zh' ? '导出对话' : 'Export'}>
              <FileDown className="w-3 md:w-4 h-3 md:h-4" /> <span className="text-xs">{locale === 'zh' ? '导出' : 'Export'}</span>
            </Button>
            <Button variant="outline" size="sm" onClick={handleCreateSession} className="text-xs md:text-sm h-8 md:h-9">
              <Plus className="w-3 md:w-4 h-3 md:h-4" /> <span className="text-xs">{locale === 'zh' ? '新建' : 'New'}</span>
            </Button>
          </div>
        </div>

        {/* Messages */}
        <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-2 md:p-4 space-y-2 md:space-y-4">
          {!currentSessionId ? (
            <div className="h-full flex flex-col items-center justify-center text-center opacity-50 px-4">
              <span className="text-4xl md:text-5xl mb-2 md:mb-4">🧬</span>
              <p className="text-base md:text-lg font-medium">{locale === 'zh' ? '你好！我是 Bio-Copilot' : 'Hello! I am Bio-Copilot'}</p>
              <p className="text-xs md:text-sm text-muted-foreground">
                {locale === 'zh' ? '选择或创建对话开始' : 'Select or create a conversation to start'}
              </p>
            </div>
          ) : (sessionMessages?.length === 0 && !streamingContent) ? (
            <div className="h-full flex flex-col items-center justify-center text-center opacity-50 px-4">
              <span className="text-4xl md:text-5xl mb-2 md:mb-4">🧬</span>
              <p className="text-base md:text-lg font-medium">{locale === 'zh' ? '你好！我是 Bio-Copilot' : 'Hello! I am Bio-Copilot'}</p>
              <p className="text-xs md:text-sm text-muted-foreground">{locale === 'zh' ? '我可以帮你分析数据，管理项目、运行工作流' : 'I can help you analyze data, manage projects, and run workflows'}</p>
            </div>
          ) : (
            <>
              {sessionMessages?.map((msg, idx) => renderMessage(msg, idx))}
              {pendingUserMessage && (
                <div className="flex justify-end">
                  <div className="max-w-[90%] md:max-w-[85%] rounded-2xl px-3 md:px-4 py-2 md:py-3 bg-primary text-primary-foreground">
                    <div className="text-sm md:text-base whitespace-pre-wrap">
                      {pendingUserMessage}
                    </div>
                  </div>
                </div>
              )}
              {streamingContent && (
                <div className="flex justify-start">
                  <div className="rounded-2xl px-3 md:px-4 py-2 md:py-3 bg-card border max-w-[90%] md:max-w-[85%]">
                    <div className="text-sm md:text-base">
                      <ReactMarkdown
                        components={{
                          code({ node, inline, className, children, ...props }: any) {
                            const match = /language-(\w+)/.exec(className || '');
                            const code = String(children).replace(/\n$/, '');
                            if (!inline && match) {
                              return <CodeBlock code={code} language={match[1]} />;
                            }
                            return <code className={className} {...props}>{children}</code>;
                          }
                        }}
                      >
                        {streamingContent}
                      </ReactMarkdown>
                    </div>
                    {streamingPlan && renderPlanCard(streamingPlan)}
                  </div>
                </div>
              )}
              {isLoading && !streamingContent && (
                <div className="flex justify-start">
                  <div className="bg-card border rounded-2xl px-3 md:px-4 py-2 md:py-3 flex items-center gap-2">
                    <span className="relative flex h-3 w-3"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span><span className="relative inline-flex rounded-full h-3 w-3 bg-primary"></span></span>
                    <span className="text-muted-foreground text-xs md:text-sm">Thinking...</span>
                  </div>
                </div>
              )}
            </>
          )}
          <div ref={messagesEndRef} />
          {showSavedIndicator && (
            <div className="text-center py-2 text-xs text-muted-foreground animate-fade-in">
              ✓ Saved
            </div>
          )}
          {errorMessage && (
            <div className="text-center py-2 text-xs text-red-500 bg-red-50 dark:bg-red-900/20 rounded-lg mx-2">
              ⚠️ {errorMessage}
              <button onClick={() => setErrorMessage(null)} className="ml-2 underline">✕</button>
            </div>
          )}
        </div>

        {/* Slash Command Menu */}
        {showSlashMenu && (
          <div className="absolute bottom-20 left-4 md:left-8 w-64 bg-card border rounded-lg shadow-lg z-50 max-h-48 overflow-y-auto">
            {filteredCommands.map(cmd => (
              <button
                key={cmd.id}
                onClick={() => handleSlashCommand(cmd)}
                className="w-full px-3 py-2 text-left hover:bg-accent flex items-center gap-2"
              >
                <CornerDownLeft className="w-4 h-4 text-muted-foreground" />
                <div>
                  <div className="text-sm font-medium">{cmd.label}</div>
                  <div className="text-xs text-muted-foreground">{cmd.description}</div>
                </div>
              </button>
            ))}
            {filteredCommands.length === 0 && (
              <div className="px-3 py-2 text-sm text-muted-foreground">
                {locale === 'zh' ? '无匹配命令' : 'No matching commands'}
              </div>
            )}
          </div>
        )}

        {/* Input */}
        <div className="p-2 md:p-4 bg-card border-t">
          {attachments.length > 0 && (
            <div className="max-w-3xl mx-auto mb-2 flex flex-wrap gap-2">
              {attachments.map((att, idx) => (
                <div key={idx} className="relative group flex items-center gap-2 bg-secondary rounded-lg px-3 py-1.5">
                  {att.preview ? (
                    <img src={att.preview} alt="attachment" loading="lazy" className="w-8 h-8 object-cover rounded" />
                  ) : (
                    <FileText className="w-4 h-4 text-muted-foreground" />
                  )}
                  <span className="text-xs max-w-[100px] truncate">{att.file.name}</span>
                  <button onClick={() => removeAttachment(idx)} className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
          
          {/* Gemini-style floating input */}
          <div className="max-w-4xl mx-auto px-2 md:px-4">
            {/* Floating pill-shaped input bar */}
            <div className={`relative ${isDark ? 'bg-gray-800' : 'bg-white'} rounded-2xl shadow-lg border ${isDark ? 'border-gray-700 hover:border-gray-600' : 'border-gray-200 hover:border-gray-300'} transition-all`}>
              
              {/* Left action icons - Upload button */}
              <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center">
                <button 
                  type="button" 
                  onClick={() => fileInputRef.current?.click()} 
                  className="p-2 text-muted-foreground hover:text-foreground hover:bg-gray-200/60 dark:hover:bg-gray-600/60 rounded-full transition-colors" 
                  title={locale === 'zh' ? '上传文件' : 'Upload file'}
                >
                  <Plus className="w-5 h-5" />
                </button>
              </div>
              

              {/* Textarea */}
              <textarea
                ref={inputRef}
                value={input}
                placeholder={locale === 'zh' 
                  ? '尝试: "帮我分析RNA-seq数据" 或 "创建新项目" (Ctrl+Enter发送)' 
                  : 'Try: "Analyze RNA-seq data" or "Create new project" (Ctrl+Enter)'}
                onChange={(e) => {
                  const val = e.target.value;
                  setInput(val);
                  if (val.startsWith('/')) {
                    setSlashFilter(val.slice(1));
                    setShowSlashMenu(true);
                  } else {
                    setShowSlashMenu(false);
                  }
                }}
                onPaste={handlePaste}
                onKeyDown={(e) => { 
                  if (e.key === 'Enter' && !e.shiftKey && !showSlashMenu) { 
                    e.preventDefault(); 
                    handleSendStream(e);
                  }
                }}
                className="w-full bg-transparent text-foreground py-3 pl-12 pr-24 rounded-2xl outline-none resize-none text-sm min-h-[52px] max-h-[200px] placeholder:text-muted-foreground"
                rows={1}
                disabled={!selectedProjectId}
              />
              {input.length > 0 && (
                <span className="absolute bottom-1 right-16 text-[10px] text-muted-foreground opacity-50">{input.length}</span>
              )}
              
              {/* Right action buttons */}
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 z-50">
                {/* Voice button */}
                <button 
                  type="button" 
                  onClick={toggleVoiceInput} 
                  className={`p-2 rounded-full transition-colors ${isRecording ? 'text-red-500 animate-pulse bg-red-100 dark:bg-red-900/30' : 'text-muted-foreground hover:text-foreground hover:bg-gray-200/60 dark:hover:bg-gray-600/60'}`} 
                  title={locale === 'zh' ? '语音输入' : 'Voice input'}
                  disabled={!selectedProjectId || !currentSessionId}
                >
                  {isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                </button>
                
                {/* Send or Stop button */}
                {isLoading ? (
                  <button 
                    type="button"
                    onClick={() => setIsLoading(false)}
                    className="p-2.5 bg-red-500 text-white rounded-full hover:bg-red-600 transition-all hover:scale-105 active:scale-95"
                    title={locale === 'zh' ? '停止' : 'Stop'}
                  >
                    <Square className="w-4 h-4" />
                  </button>
                ) : (
                  <button 
                    type="button" 
                    onClick={() => { try { handleSendStream({ preventDefault: () => {} } as any); } catch(err) { console.error('Send error:', err); }}}
                    disabled={false}
                    className={`p-2.5 rounded-full transition-all hover:scale-105 active:scale-95 ${
                      (input.trim() || attachments.length > 0) && selectedProjectId
                        ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                        : 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'
                    }`}
                    title={locale === 'zh' ? '发送' : 'Send'}
                  >
                    <Send className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
          <input type="file" ref={fileInputRef} onChange={handleFileSelect} multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt" className="hidden" />
        </div>
      </div>
      
      {/* Lightbox for image gallery */}
      <Lightbox
        isOpen={lightboxOpen}
        images={lightboxImages}
        currentIndex={lightboxIndex}
        onClose={() => setLightboxOpen(false)}
        onPrev={() => setLightboxIndex(prev => Math.max(0, prev - 1))}
        onNext={() => setLightboxIndex(prev => Math.min(lightboxImages.length - 1, prev + 1))}
      />
    </div>
  );
}
