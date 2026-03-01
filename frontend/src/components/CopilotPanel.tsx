'use client';
import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import { toast } from '@/components/ui/Toast';
import { useCopilotStore, ChatMessage as StoreChatMessage } from '@/stores/copilotStore';
import { useTheme } from '@/stores/themeStore';
import { useLocale } from '@/stores/localeStore';
import { cn } from '@/lib/utils';
import { FlaskConical, Check, Code, ClipboardCheck, Archive, Play, Send, X, Eye, Download, Trash2, Plus, Maximize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/badge';

interface CopilotPanelProps {
  projectId: string;
  fullscreen?: boolean;
  onToggleFullscreen?: () => void;
}

interface Attachment {
  type: 'image' | 'table' | 'pdf' | 'file';
  name: string;
  data?: string;
  preview?: string;
  full_available?: boolean;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  plan_data?: string | null;
  attachments?: string | null;
  created_at?: string;
}

interface FullscreenPreview {
  type: 'image' | 'table' | 'pdf';
  data: string;
  name: string;
}

export default function CopilotPanel({ projectId, fullscreen = false, onToggleFullscreen }: CopilotPanelProps) {
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [streamingPlan, setStreamingPlan] = useState<string | null>(null);
  
  const [fullscreenPreview, setFullscreenPreview] = useState<FullscreenPreview | null>(null);
  
  const { resolvedTheme } = useTheme();
  const { locale } = useLocale();
  const isDark = resolvedTheme === 'dark';
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const prevMsgCountRef = useRef(0);
  const isInitialLoadRef = useRef(true);
  
  const store = useCopilotStore();
  
  const currentSession = store.getCurrentSession(projectId) || 'default';
  const messages = store.getMessages(projectId, currentSession);
  const sessions = store.getSessions(projectId);
  const hasMore = store.getHasMore(projectId, currentSession);
  const isLoadingMore = store.getIsLoadingMore(projectId, currentSession);
  const pendingTaskCount = store.getPendingTaskCount(projectId);

  const setCurrentSession = useCallback((sessionId: string) => {
    store.setCurrentSession(projectId, sessionId);
  }, [projectId]);

  const fetchSessions = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/ai/projects/${projectId}/chat/sessions`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        store.setSessions(projectId, data.sessions);
      }
    } catch (e) { console.error(e); }
  }, [projectId, store]);

  const fetchRecentMessages = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/ai/projects/${projectId}/chat/history?session_id=${currentSession}&limit=20`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        store.setMessages(projectId, currentSession, data.messages);
        store.setHasMore(projectId, currentSession, data.has_more);
        store.setOldestTimestamp(projectId, currentSession, data.oldest_created_at);
      }
    } catch (e) { console.error(e); }
  }, [projectId, currentSession, store]);

  const fetchOlderMessages = useCallback(async () => {
    if (isLoadingMore || !hasMore) return;
    
    const oldestTs = store.getOldestTimestamp(projectId, currentSession);
    if (!oldestTs) return;
    
    store.setIsLoadingMore(projectId, currentSession, true);
    
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/ai/projects/${projectId}/chat/history` +
        `?session_id=${currentSession}&limit=20&before=${encodeURIComponent(oldestTs)}`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      if (res.ok) {
        const data = await res.json();
        if (data.messages.length > 0) {
          store.prependMessages(projectId, currentSession, data.messages);
        }
        store.setHasMore(projectId, currentSession, data.has_more);
        store.setOldestTimestamp(projectId, currentSession, data.oldest_created_at);
      }
    } catch (e) { 
      console.error(e); 
    } finally {
      store.setIsLoadingMore(projectId, currentSession, false);
    }
  }, [projectId, currentSession, hasMore, isLoadingMore, store]);

  const checkPendingTasks = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/ai/projects/${projectId}/chat/has-pending-tasks`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        store.setPendingTaskCount(projectId, data.count);
        return data.has_pending;
      }
    } catch (e) { console.error(e); }
    return false;
  }, [projectId, store]);

  useEffect(() => {
    if (messages.length === 0) {
      fetchRecentMessages();
    }
    fetchSessions();
  }, [projectId]);

  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const isPollingRef = useRef(false);

  useEffect(() => {
    const startSmartPolling = async () => {
      if (isPollingRef.current) return;
      
      const hasPending = await checkPendingTasks();
      if (hasPending) {
        fetchRecentMessages();
        isPollingRef.current = true;
        
        pollingRef.current = setInterval(async () => {
          const stillPending = await checkPendingTasks();
          if (stillPending) {
            fetchRecentMessages();
          } else {
            if (pollingRef.current) {
              clearInterval(pollingRef.current);
              pollingRef.current = null;
            }
            isPollingRef.current = false;
          }
        }, 5000);
      }
    };
    
    startSmartPolling();
    
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
      isPollingRef.current = false;
    };
  }, [projectId, currentSession]);

  useEffect(() => {
    if (messages.length > prevMsgCountRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: isInitialLoadRef.current ? 'auto' : 'smooth' });
      prevMsgCountRef.current = messages.length;
      isInitialLoadRef.current = false;
    }
  }, [messages.length]);

  const handleScroll = useCallback(async (e: React.UIEvent<HTMLDivElement>) => {
    const container = e.currentTarget;
    const isAtTop = container.scrollTop < 100;
    
    if (isAtTop && hasMore && !isLoadingMore) {
      const prevScrollHeight = container.scrollHeight;
      await fetchOlderMessages();
      requestAnimationFrame(() => {
        const newScrollHeight = container.scrollHeight;
        container.scrollTop = newScrollHeight - prevScrollHeight + container.scrollTop;
      });
    }
  }, [hasMore, isLoadingMore, fetchOlderMessages]);

  const handleNewSession = () => {
      const newId = `chat-${Date.now()}`;
      const newSessions = [newId, ...sessions];
      store.setSessions(projectId, newSessions);
      setCurrentSession(newId);
      store.setMessages(projectId, newId, []);
      prevMsgCountRef.current = 0;
      isInitialLoadRef.current = true;
  };

  const handleDeleteSession = async (sessionId: string) => {
    if (sessionId === 'default') {
      toast.error('Cannot delete the default session');
      return;
    }
    if (!confirm(`Delete this chat session? The tasks will be preserved.`)) return;
    
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/ai/projects/${projectId}/chat/sessions/${sessionId}`,
        {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` }
        }
      );
      
      if (res.ok) {
        const newSessions = sessions.filter(s => s !== sessionId);
        store.setSessions(projectId, newSessions);
        store.clearProject(projectId);
        if (currentSession === sessionId) {
          setCurrentSession('default');
        }
        toast.success('Session deleted');
        fetchSessions();
      } else {
        const err = await res.json();
        toast.error(err.detail || 'Failed to delete session');
      }
    } catch (e) {
      toast.error('Failed to delete session');
    }
  };

  const handleClearSession = async () => {
    if (!confirm(`Clear all messages in this session? This cannot be undone.`)) return;
    
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/ai/projects/${projectId}/chat/sessions/${currentSession}/clear`,
        {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` }
        }
      );
      
      if (res.ok) {
        store.setMessages(projectId, currentSession, []);
        store.setHasMore(projectId, currentSession, false);
        store.setOldestTimestamp(projectId, currentSession, null);
        toast.success('Chat history cleared');
      } else {
        const err = await res.json();
        toast.error(err.detail || 'Failed to clear history');
      }
    } catch (e) {
      toast.error('Failed to clear history');
    }
  };

  const handleSendStream = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMsg = input;
    setInput('');
    store.appendMessage(projectId, currentSession, { role: 'user', content: userMsg });
    setIsLoading(true);
    setStreamingContent('');
    setStreamingPlan(null);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/ai/projects/${projectId}/chat/stream`,
        {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json', 
            'Authorization': `Bearer ${token}` 
          },
          body: JSON.stringify({ message: userMsg, session_id: currentSession })
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      const decoder = new TextDecoder();
      let accumulatedContent = '';
      let accumulatedPlan: string | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value, { stream: true });
        const lines = text.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              
              switch (data.type) {
                case 'start':
                  break;
                  
                case 'token':
                  accumulatedContent += data.content;
                  setStreamingContent(accumulatedContent);
                  break;
                  
                case 'plan':
                  accumulatedPlan = data.plan_data;
                  setStreamingPlan(accumulatedPlan);
                  break;
                  
                case 'done':
                  store.appendMessage(projectId, currentSession, { 
                    role: 'assistant', 
                    content: accumulatedContent || 'I have created an analysis plan for you.',
                    plan_data: accumulatedPlan
                  });
                  setStreamingContent('');
                  setStreamingPlan(null);
                  break;
                  
                case 'error':
                  toast.error(data.message);
                  store.appendMessage(projectId, currentSession, { 
                    role: 'assistant', 
                    content: `❌ **Error**: ${data.message}` 
                  });
                  setStreamingContent('');
                  setStreamingPlan(null);
                  break;
              }
            } catch (parseError) {
              console.error('Failed to parse SSE data:', parseError);
            }
          }
        }
      }
    } catch (error) {
      console.error('Stream error:', error);
      store.appendMessage(projectId, currentSession, { 
        role: 'assistant', 
        content: "❌ **Error**: Connection failed. Please try again." 
      });
      setStreamingContent('');
      setStreamingPlan(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmTool = async (toolId: string, parameters: Record<string, any> = {}) => {
    const toastId = toast.loading('Starting tool execution...');
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/ai/projects/${projectId}/chat/confirm-tool`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ tool_id: toolId, parameters, session_id: currentSession })
      });
      
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || 'Failed to confirm tool');
      }
      
      toast.success('Tool execution started!', { id: toastId });
      await fetchRecentMessages();
    } catch (e: any) {
      toast.error(e.message, { id: toastId, duration: 6000 });
    }
  };

  const handleSelectToolFromChoice = async (tool: any) => {
    const planData = {
      type: 'tool_choice',
      selected_tool_id: tool.tool_id,
      parameters: tool.inferred_params || {},
      strategy: `Using ${tool.tool_name} for analysis`
    };
    
    await handleConfirmTool(tool.tool_id, tool.inferred_params || {});
  };

  const handleConfirmPlan = async (planDataStr: string) => {
    const toastId = toast.loading('Submitting task to cluster...');
    try {
      const token = localStorage.getItem('token');
      const plan = JSON.parse(planDataStr);
      const planType = plan.type || 'single';
      
      if (planType === 'tool_recommendation' && plan.matched_tools?.[0]) {
        const tool = plan.matched_tools[0];
        await handleConfirmTool(tool.tool_id, tool.inferred_params || plan.suggested_params || {});
        toast.dismiss(toastId);
        return;
      }
      
      if (planType === 'tool_choice' && plan.selected_tool_id) {
        await handleConfirmTool(plan.selected_tool_id, plan.parameters || {});
        toast.dismiss(toastId);
        return;
      }
      
      let endpoint = `${process.env.NEXT_PUBLIC_API_URL}/ai/projects/${projectId}/chat/execute-plan`;
      if (planType === 'multi') {
        endpoint = `${process.env.NEXT_PUBLIC_API_URL}/ai/projects/${projectId}/chat/execute-chain`;
      }
      
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ plan_data: plan, session_id: currentSession })
      });
      
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || 'Failed to execute plan');
      }
      
      toast.success(planType === 'multi' ? 'Task chain submitted successfully!' : 'Task submitted successfully!', { id: toastId });
      await fetchRecentMessages(); 
    } catch (e: any) {
      toast.error(e.message, { id: toastId, duration: 6000 });
    }
  };

  const renderToolChoiceCard = (plan: any) => {
    const matchedTools = plan.matched_tools || [];
    const isHighConfidence = plan.type === 'tool_recommendation';
    
    return (
      <div className="mt-4 bg-card border border-primary/30 rounded-2xl shadow-lg overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500"></div>
        
        <div className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <FlaskConical className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h4 className="text-lg font-bold text-foreground">
                {isHighConfidence ? 'Recommended Tool' : 'Tool Options Available'}
              </h4>
              <p className="text-xs text-primary">
                {isHighConfidence ? 'High confidence match found' : 'Select a tool or use custom code'}
              </p>
            </div>
          </div>
          
          {plan.strategy && (
            <div className="bg-card/50 rounded-xl p-4 mb-5 border border-border">
              <div className="flex items-start gap-2">
                <span className="text-lg">💡</span>
                <p className="text-foreground text-sm leading-relaxed flex-1">{plan.strategy}</p>
              </div>
            </div>
          )}
          
          <div className="space-y-3 mb-5">
            {matchedTools.map((tool: any, idx: number) => {
              const scorePercent = Math.round((tool.match_score || 0) * 100);
              const scoreColor = scorePercent >= 75 ? 'text-emerald-500' : scorePercent >= 50 ? 'text-yellow-500' : 'text-muted-foreground';
              
              return (
                <div 
                  key={tool.tool_id}
                  className="bg-primary/5 border border-primary/20 rounded-xl p-4 hover:bg-primary/10 transition-colors"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <span className="text-lg">🔧</span>
                      </div>
                      <div>
                        <div className="text-foreground font-medium">{tool.tool_name}</div>
                        <div className="text-xs text-muted-foreground">{tool.workflow_type}</div>
                      </div>
                    </div>
                    <div className={`text-right ${scoreColor}`}>
                      <div className="text-lg font-bold">{scorePercent}%</div>
                      <div className="text-xs">match</div>
                    </div>
                  </div>
                  
                  {tool.description && (
                    <p className="text-xs text-muted-foreground mb-3">{tool.description}</p>
                  )}
                  
                  {tool.match_reason && (
                    <div className="text-xs text-primary/80 mb-3">
                      <span className="font-medium">Why: </span>{tool.match_reason}
                    </div>
                  )}
                  
                  {tool.params_schema && Object.keys(tool.params_schema.properties || {}).length > 0 && (
                    <details className="mb-3">
                      <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                        📋 View Parameters Schema ({Object.keys(tool.params_schema.properties || {}).length} params)
                      </summary>
                      <div className="mt-2 bg-card rounded-lg p-3 text-xs font-mono overflow-x-auto max-h-40 overflow-y-auto">
                        <pre className="text-foreground">{JSON.stringify(tool.params_schema, null, 2)}</pre>
                      </div>
                    </details>
                  )}
                  
                  {tool.inferred_params && Object.keys(tool.inferred_params).length > 0 && (
                    <div className="text-xs text-muted-foreground mb-3">
                      <span className="font-medium">Suggested params: </span>
                      <span className="text-emerald-500">{JSON.stringify(tool.inferred_params)}</span>
                    </div>
                  )}
                  
                  <Button
                    onClick={() => handleSelectToolFromChoice(tool)}
                    className="w-full mt-2 gap-2"
                  >
                    <Check className="w-4 h-4" />
                    Use This Tool
                  </Button>
                </div>
              );
            })}
          </div>
          
          {!isHighConfidence && (
            <Button
              variant="outline"
              onClick={() => {
                const customPlan = {
                  type: 'single',
                  method: 'sandbox',
                  strategy: 'Generate custom Python code for this analysis',
                  custom_code: '# Custom code will be generated based on your request'
                };
                handleConfirmPlan(JSON.stringify(customPlan));
              }}
              className="w-full gap-2"
            >
              <Code className="w-4 h-4" />
              Generate Custom Code Instead
            </Button>
          )}
        </div>
      </div>
    );
  };

  const renderPlanCard = (planDataStr: string) => {
    let plan;
    try { plan = JSON.parse(planDataStr); } catch { return null; }
    
    const planType = plan.type || 'single';
    
    if (planType === 'tool_recommendation' || planType === 'tool_choice') {
      return renderToolChoiceCard(plan);
    }
    
    const isMultiStep = planType === 'multi';

    return (
      <div className="mt-4 bg-card border border-emerald-500/30 rounded-2xl shadow-lg overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500"></div>
        
        <div className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
              <ClipboardCheck className="w-5 h-5 text-emerald-500" />
            </div>
            <div>
              <h4 className="text-lg font-bold text-foreground">
                {isMultiStep ? `Multi-Step Analysis (${plan.steps?.length || 0} Steps)` : 'Analysis Strategy'}
              </h4>
              <p className="text-xs text-emerald-500">Review and confirm to execute</p>
            </div>
          </div>
          
          <div className="bg-card/50 rounded-xl p-4 mb-5 border border-border">
            <div className="flex items-start gap-2">
              <span className="text-lg">💡</span>
              <p className="text-foreground text-sm leading-relaxed flex-1">{plan.strategy}</p>
            </div>
          </div>
          
          {isMultiStep ? (
            <div className="mb-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-2 h-2 rounded-full bg-purple-500"></div>
                <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Execution Steps</span>
              </div>
              
              <div className="space-y-3">
                {plan.steps?.map((step: any, idx: number) => (
                  <div key={idx} className="bg-purple-500/10 border border-purple-500/20 rounded-xl p-4">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center flex-shrink-0">
                        <span className="text-purple-400 font-semibold text-sm">{step.step || idx + 1}</span>
                      </div>
                      <div>
                        <div className="text-foreground font-medium">{step.action}</div>
                        <div className="text-xs text-muted-foreground">Expected: {step.expected_output}</div>
                      </div>
                    </div>
                    <pre className="bg-muted p-3 text-xs text-foreground font-mono overflow-x-auto max-h-32 overflow-y-auto rounded-lg">
                      <code>{step.code}</code>
                    </pre>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="mb-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Execution Method</span>
              </div>
              
              {plan.method === 'workflow' ? (
                <div className="flex items-center gap-3 bg-blue-500/10 border border-blue-500/20 rounded-xl p-4">
                  <div className="w-12 h-12 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                    <Archive className="w-6 h-6 text-blue-500" />
                  </div>
                  <div>
                    <div className="text-xs text-blue-400 mb-1">Predefined Pipeline</div>
                    <div className="text-foreground font-mono font-semibold">{plan.workflow_name}</div>
                  </div>
                </div>
              ) : (
                <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl overflow-hidden">
                  <div className="flex items-center gap-3 p-4 border-b border-purple-500/10">
                    <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center flex-shrink-0">
                      <Code className="w-5 h-5 text-purple-400" />
                    </div>
                    <div>
                      <div className="text-xs text-purple-400">Custom Python Code</div>
                      <div className="text-foreground text-sm">Sandbox Environment</div>
                    </div>
                  </div>
                  <div className="relative">
                    <div className="absolute top-2 left-0 right-0 flex items-center justify-between px-4 z-10">
                      <span className="text-[10px] text-muted-foreground font-mono">python</span>
                      <div className="flex gap-1">
                        <div className="w-2 h-2 rounded-full bg-red-500/50"></div>
                        <div className="w-2 h-2 rounded-full bg-yellow-500/50"></div>
                        <div className="w-2 h-2 rounded-full bg-green-500/50"></div>
                      </div>
                    </div>
                    <pre className="bg-muted p-4 pt-8 text-xs text-emerald-600 dark:text-emerald-400 font-mono overflow-x-auto max-h-64 overflow-y-auto rounded-lg leading-relaxed">
                      <code>{plan.custom_code}</code>
                    </pre>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex items-center gap-3">
            <Button 
              onClick={() => handleConfirmPlan(planDataStr)} 
              className="flex-1 gap-2"
            >
              <Play className="w-5 h-5" />
              {isMultiStep ? 'Execute Task Chain' : 'Execute Analysis'}
            </Button>
          </div>
        </div>
      </div>
    );
  };

  const downloadFile = (dataUrl: string, filename: string) => {
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const renderAttachments = (attachmentsStr: string | null) => {
    if (!attachmentsStr) return null;
    
    let attachments: Attachment[] = [];
    try {
      attachments = JSON.parse(attachmentsStr);
    } catch {
      return null;
    }

    if (!attachments || attachments.length === 0) return null;

    return (
      <div className="mt-4 space-y-4">
        {attachments.map((att, idx) => {
          if (att.type === 'image') {
            return (
              <div key={idx} className="bg-card rounded-xl p-4 border border-border">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-muted-foreground flex items-center gap-2">
                    <span>📊</span> {att.name}
                  </span>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setFullscreenPreview({ type: 'image', data: att.data!, name: att.name })}>
                      <Eye className="w-4 h-4 mr-1" />
                      Fullscreen
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => att.data && downloadFile(att.data, att.name)}>
                      <Download className="w-4 h-4 mr-1" />
                      Download
                    </Button>
                  </div>
                </div>
                <img 
                  src={att.data} 
                  alt={att.name} 
                  className="max-w-full max-h-96 rounded-lg shadow-lg cursor-pointer hover:opacity-90 transition-opacity"
                  onClick={() => setFullscreenPreview({ type: 'image', data: att.data!, name: att.name })}
                />
              </div>
            );
          }

          if (att.type === 'table') {
            const lines = (att.preview || '').split('\n').slice(0, 20);
            return (
              <div key={idx} className="bg-card rounded-xl p-4 border border-border">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-muted-foreground flex items-center gap-2">
                    <span>📄</span> {att.name}
                  </span>
                  <Button variant="ghost" size="sm" onClick={() => setFullscreenPreview({ type: 'table', data: att.preview || '', name: att.name })}>
                    <Eye className="w-4 h-4 mr-1" />
                    View All
                  </Button>
                </div>
                <div className="overflow-x-auto max-h-48 text-xs text-foreground font-mono bg-muted rounded p-2">
                  <table className="w-full">
                    <tbody>
                      {lines.map((row, i) => (
                        <tr key={i} className="border-b border-border">
                          {row.split(/[,\t]/).map((cell, j) => (
                            <td key={j} className="px-2 py-1 whitespace-nowrap">{cell}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          }

          if (att.type === 'pdf') {
            return (
              <div key={idx} className="bg-card rounded-xl p-4 border border-border">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-muted-foreground flex items-center gap-2">
                    <span>📕</span> {att.name}
                  </span>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setFullscreenPreview({ type: 'pdf', data: att.data!, name: att.name })}>
                      <Eye className="w-4 h-4 mr-1" />
                      Preview
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => att.data && downloadFile(att.data, att.name)}>
                      <Download className="w-4 h-4 mr-1" />
                      Download
                    </Button>
                  </div>
                </div>
                <div className="bg-muted/50 rounded-lg p-6 text-center">
                  <div className="text-4xl mb-2">📕</div>
                  <div className="text-sm text-muted-foreground">{att.name}</div>
                  <div className="text-xs text-muted-foreground mt-1">Click Preview to view or Download to save</div>
                </div>
              </div>
            );
          }

          return null;
        })}
      </div>
    );
  };

  const renderFullscreenPreview = () => {
    if (!fullscreenPreview) return null;

    return (
      <div 
        className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
        onClick={() => setFullscreenPreview(null)}
      >
        <div className="relative max-w-6xl max-h-full w-full" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-foreground font-medium">{fullscreenPreview.name}</h3>
            <Button variant="ghost" size="icon" onClick={() => setFullscreenPreview(null)}>
              <X className="w-5 h-5" />
            </Button>
          </div>
          
          {fullscreenPreview.type === 'image' && (
            <img 
              src={fullscreenPreview.data} 
              alt={fullscreenPreview.name}
              className="max-w-full max-h-[85vh] mx-auto rounded-lg shadow-2xl"
            />
          )}
          
          {fullscreenPreview.type === 'table' && (
            <div className="bg-card rounded-xl p-6 max-h-[85vh] overflow-auto border border-border">
              <table className="w-full text-sm text-foreground font-mono">
                <tbody>
                  {fullscreenPreview.data.split('\n').map((row, i) => (
                    <tr key={i} className="border-b border-border">
                      {row.split(/[,\t]/).map((cell, j) => (
                        <td key={j} className="px-3 py-2 whitespace-nowrap">{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          
          {fullscreenPreview.type === 'pdf' && (
            <div className="bg-card rounded-xl max-h-[85vh] overflow-hidden">
              <iframe 
                src={fullscreenPreview.data}
                className="w-full h-[80vh] rounded-lg"
                title={fullscreenPreview.name}
              />
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderMessage = (msg: ChatMessage, idx: number) => {
    const maxWidthClass = fullscreen ? "max-w-[95%]" : "max-w-[85%]";
    return (
      <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2`}>
        <div className={`${maxWidthClass} rounded-2xl px-4 md:px-5 py-3 ${
          msg.role === 'user' ? 'bg-primary text-primary-foreground shadow-lg' : 'bg-card text-foreground border border-border'
        }`}>
          <div className={`prose prose-sm ${isDark ? 'prose-invert' : ''} max-w-none`}>
            <ReactMarkdown
              urlTransform={(value: string) => value}
              components={{
                img: ({node, ...props}) => (
                  <div className="my-4 bg-muted/50 p-3 rounded-xl border border-border inline-block">
                    <img {...props} className="max-w-full h-auto rounded-lg cursor-pointer hover:opacity-90" alt="AI Generated Graphic" />
                  </div>
                )
              }}
            >
              {msg.content}
            </ReactMarkdown>
          </div>
          {msg.plan_data && renderPlanCard(msg.plan_data)}
          {msg.attachments && renderAttachments(msg.attachments)}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-background text-foreground">
      {/* Header - minimal in fullscreen mode */}
      <div className={cn(
        "border-b border-border bg-card/50 flex justify-between items-center gap-2",
        fullscreen ? "p-2" : "p-3 md:p-4"
      )}>
        <div className="flex items-center gap-2 md:gap-3 min-w-0">
            <span className={cn("animate-pulse flex-shrink-0", fullscreen ? "text-lg" : "text-xl md:text-2xl")}>✨</span>
            {!fullscreen && (
              <div className="min-w-0">
                <h3 className="font-bold text-foreground text-sm md:text-lg truncate">{locale === 'zh' ? '生物 Copilot' : 'Bio-Copilot'}</h3>
                <p className="text-xs text-primary font-medium hidden sm:block">{locale === 'zh' ? '您的 AI 生物信息学规划师' : 'Your AI Bioinformatics Planner'}</p>
              </div>
            )}
            {fullscreen && (
              <h3 className="font-bold text-foreground text-sm truncate">{locale === 'zh' ? '生物 Copilot' : 'Bio-Copilot'}</h3>
            )}
        </div>
        <div className="flex items-center gap-1 md:gap-2 flex-shrink-0">
            {!fullscreen && onToggleFullscreen && (
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={onToggleFullscreen}
                className="touch-target-min"
                title={locale === 'zh' ? '全屏模式' : 'Fullscreen'}
              >
                <Maximize2 className="w-4 h-4" />
              </Button>
            )}
            <select 
                className="bg-background border border-input text-foreground text-xs rounded-lg px-2 py-1.5 outline-none focus:border-primary max-w-[80px] md:max-w-none"
                value={currentSession}
                onChange={(e) => { 
                  setCurrentSession(e.target.value); 
                  prevMsgCountRef.current=0; 
                  isInitialLoadRef.current = true;
                }}
            >
                {sessions.map(s => <option key={s} value={s}>{s === 'default' ? (locale === 'zh' ? '主会话' : 'Main') : `Chat (${s.slice(-4)})`}</option>)}
            </select>
            {messages.length > 0 && (
              <Button variant="ghost" size="sm" onClick={handleClearSession} className="text-yellow-500 touch-target-min" title="Clear chat history">
                🧹
              </Button>
            )}
            {currentSession !== 'default' && (
              <Button variant="ghost" size="sm" onClick={() => handleDeleteSession(currentSession)} className="text-destructive touch-target-min" title="Delete current session">
                <Trash2 className="w-4 h-4" />
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={handleNewSession} className="gap-1 text-xs">
                <Plus className="w-3.5 md:w-4 h-3.5 md:h-4" />
                <span className="hidden sm:inline">{locale === 'zh' ? '新建' : 'New'}</span>
            </Button>
        </div>
      </div>

      <div ref={messagesContainerRef} onScroll={handleScroll} className={cn(
        "flex-1 overflow-y-auto space-y-3 md:space-y-6 scrollbar-thin",
        fullscreen ? "p-2 md:p-3" : "p-3 md:p-6"
      )}>
        {hasMore && (
          <div className="text-center py-2">
            {isLoadingMore ? (
              <span className="text-muted-foreground text-sm">⏳ {locale === 'zh' ? '加载中...' : 'Loading...'}</span>
            ) : (
              <Button variant="link" onClick={fetchOlderMessages}>
                ↑ {locale === 'zh' ? '加载更早消息' : 'Load older messages'}
              </Button>
            )}
          </div>
        )}
        {messages.length === 0 && !streamingContent ? (
          <div className="h-full flex flex-col items-center justify-center text-center opacity-50">
            <span className="text-4xl md:text-5xl mb-3 md:4">🧬</span>
            <p className="text-sm md:text-base text-muted-foreground px-4">{locale === 'zh' ? '询问关于您的文件，或请求分析流程。' : 'Ask about your files, or request an analysis pipeline.'}</p>
          </div>
        ) : (
          <>
            {messages.map((msg, idx) => renderMessage(msg, idx))}
            
            {streamingContent && (
              <div className="flex justify-start animate-in fade-in">
                <div className={cn(
                  "rounded-2xl px-4 md:px-5 py-3 bg-card text-foreground border border-border",
                  fullscreen ? "max-w-[95%]" : "max-w-[90%] sm:max-w-[85%]"
                )}>
                  <div className={`prose prose-sm ${isDark ? 'prose-invert' : ''} max-w-none`}>
                    <ReactMarkdown>{streamingContent}</ReactMarkdown>
                  </div>
                  {streamingPlan && renderPlanCard(streamingPlan)}
                </div>
              </div>
            )}
          </>
        )}
        
        {isLoading && !streamingContent && (
          <div className="flex justify-start">
            <div className="bg-card border border-border rounded-2xl px-4 md:px-5 py-3 md:py-4 flex items-center gap-2 md:gap-3">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-primary"></span>
              </span>
              <span className="text-muted-foreground text-sm animate-pulse">{locale === 'zh' ? '思考中...' : 'Thinking...'}</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-2 md:p-4 bg-card border-t border-border">
        <form onSubmit={handleSendStream} className="relative max-w-4xl mx-auto flex items-end bg-background border border-input rounded-xl overflow-hidden focus-within:border-primary transition-all">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendStream(e); } }}
            placeholder={locale === 'zh' ? '例如：我的文件有哪些？或者：绘制 data.csv 的 PCA 图...' : 'E.g., What files do I have? OR Plot a PCA from data.csv...'}
            className="w-full bg-transparent text-foreground px-3 md:px-4 py-2 md:py-3 max-h-24 md:max-h-32 outline-none resize-none placeholder:text-muted-foreground text-sm"
            rows={1}
          />
          <div className="p-1.5 md:p-2 flex-shrink-0">
            <Button type="submit" disabled={!input.trim() || isLoading} size="sm">
              <Send className="w-4 md:w-5 h-4 md:h-5" />
            </Button>
          </div>
        </form>
      </div>

      {renderFullscreenPreview()}
    </div>
  );
}
