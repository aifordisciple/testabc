'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import toast from 'react-hot-toast';

interface CopilotPanelProps {
  projectId: string;
  onTaskCreated?: (analysisId: string) => void;
}

interface MessageFile {
  type: string;
  name: string;
  data?: string;
  content?: string;
}

interface WorkflowMatch {
  template_id: string;
  template_name: string;
  description: string;
  workflow_type: string;
  match_score: number;
  match_reason: string;
  inferred_params: Record<string, any>;
  params_schema: Record<string, any>;
}

interface CopilotResponse {
  mode: 'workflow_match' | 'code_generation' | 'clarification_needed' | 'query_result' | 'error';
  matched_workflows?: WorkflowMatch[];
  generated_code?: string;
  generated_schema?: string;
  generated_description?: string;
  explanation: string;
  follow_up_questions?: string[];
  available_sample_sheets?: { id: string; name: string; description?: string }[];
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  files?: MessageFile[];
  response?: CopilotResponse;
  selectedWorkflow?: WorkflowMatch;
  params?: Record<string, any>;
  sampleSheetId?: string;
}

interface Conversation {
  id: string;
  title: string;
  summary?: string;
  created_at: string;
  updated_at: string;
  message_count: number;
}

const STORAGE_KEY = 'copilot-current-';

export default function CopilotPanel({ projectId, onTaskCreated }: CopilotPanelProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [executingId, setExecutingId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [loaded, setLoaded] = useState(false);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const api = process.env.NEXT_PUBLIC_API_URL || '';

  const getHeaders = useCallback(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : '';
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    };
  }, []);

  const loadConversations = useCallback(async () => {
    try {
      const res = await fetch(`${api}/conversations/projects/${projectId}/conversations`, {
        headers: getHeaders()
      });
      if (res.ok) {
        const data: Conversation[] = await res.json();
        setConversations(data);
        
        const saved = localStorage.getItem(STORAGE_KEY + projectId);
        const exists = data.find(c => c.id === saved);
        const targetId = exists ? saved : data[0]?.id || null;
        
        if (targetId) {
          setCurrentId(targetId);
        }
      }
    } catch (e) {
      console.error('Load conversations error:', e);
    } finally {
      setLoaded(true);
    }
  }, [projectId, api, getHeaders]);

  const loadMessages = useCallback(async (convId: string) => {
    try {
      const res = await fetch(`${api}/conversations/conversations/${convId}`, {
        headers: getHeaders()
      });
      if (res.ok) {
        const data = await res.json();
        const msgs: Message[] = (data.messages || []).map((m: any) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          response: m.response_data,
          files: m.files,
          selectedWorkflow: m.response_data?.matched_workflows?.[0],
          params: m.response_data?.matched_workflows?.[0]?.inferred_params || {},
          sampleSheetId: m.response_data?.available_sample_sheets?.[0]?.id
        }));
        setMessages(msgs);
      }
    } catch (e) {
      console.error('Load messages error:', e);
    }
  }, [api, getHeaders]);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    if (currentId && loaded) {
      loadMessages(currentId);
      localStorage.setItem(STORAGE_KEY + projectId, currentId);
    }
  }, [currentId, loaded, loadMessages, projectId]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const saveMessage = async (role: string, content: string, response?: CopilotResponse) => {
    if (!currentId) return;
    try {
      await fetch(`${api}/conversations/conversations/${currentId}/messages`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ role, content, response_mode: response?.mode, response_data: response })
      });
    } catch (e) {
      console.error('Save message error:', e);
    }
  };

  const createConversation = async () => {
    try {
      const res = await fetch(`${api}/conversations/projects/${projectId}/conversations`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ project_id: projectId, title: '新对话' })
      });
      if (res.ok) {
        const data = await res.json();
        setConversations(prev => [data, ...prev]);
        setCurrentId(data.id);
        setMessages([{
          id: 'welcome-' + data.id,
          role: 'assistant',
          content: `👋 **新对话已创建！**\n\n我可以帮你分析数据或运行生信流程。`
        }]);
      }
    } catch (e) {
      toast.error('创建对话失败');
    }
  };

  const deleteConversation = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('删除此对话？')) return;
    try {
      await fetch(`${api}/conversations/conversations/${id}`, { method: 'DELETE', headers: getHeaders() });
      const remaining = conversations.filter(c => c.id !== id);
      setConversations(remaining);
      if (currentId === id) {
        const nextId = remaining[0]?.id || null;
        setCurrentId(nextId);
        if (!nextId) setMessages([]);
      }
    } catch (e) {
      toast.error('删除失败');
    }
  };

  const handleAnalyze = async () => {
    if (!input.trim() || loading) return;
    
    if (!currentId) {
      await createConversation();
      const savedInput = input;
      setInput('');
      setTimeout(() => { setInput(savedInput); handleAnalyze(); }, 400);
      return;
    }

    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: input };
    setMessages(prev => [...prev, userMsg]);
    const query = input;
    setInput('');
    setLoading(true);

    await saveMessage('user', query);

    try {
      const res = await fetch(`${api}/ai/projects/${projectId}/copilot/analyze`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ query })
      });
      
      if (!res.ok) throw new Error((await res.json()).detail || 'Error');
      
      const data: CopilotResponse = await res.json();
      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.explanation,
        response: data,
        selectedWorkflow: data.matched_workflows?.[0],
        params: data.matched_workflows?.[0]?.inferred_params || {},
        sampleSheetId: data.available_sample_sheets?.[0]?.id
      };
      
      setMessages(prev => [...prev, assistantMsg]);
      await saveMessage('assistant', data.explanation, data);
    } catch (e: any) {
      toast.error(e.message);
      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'assistant', content: `❌ ${e.message}` }]);
    } finally {
      setLoading(false);
    }
  };

  const handleExecute = async (msg: Message) => {
    if (!msg.response || executingId) return;
    setExecutingId(msg.id);
    
    try {
      const payload: any = { mode: msg.response.mode, sample_sheet_id: msg.sampleSheetId, params: msg.params || {} };
      
      if (msg.response.mode === 'workflow_match' && msg.selectedWorkflow) {
        payload.template_id = msg.selectedWorkflow.template_id;
      } else if (msg.response.mode === 'code_generation') {
        payload.generated_code = msg.response.generated_code;
        payload.generated_schema = msg.response.generated_schema;
        payload.workflow_name = msg.response.generated_description || 'Custom';
      }
      
      const res = await fetch(`${api}/ai/projects/${projectId}/copilot/execute`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(payload)
      });
      
      if (!res.ok) throw new Error((await res.json()).detail || 'Error');
      
      const data = await res.json();
      toast.success('任务已创建！');
      
      const successMsg: Message = { id: Date.now().toString(), role: 'assistant', content: `✅ 任务已创建\n\nID: \`${data.analysis_id}\`\n流程: ${data.workflow}` };
      setMessages(prev => [...prev, successMsg]);
      await saveMessage('assistant', successMsg.content);
      
      onTaskCreated?.(data.analysis_id);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setExecutingId(null);
    }
  };

  const selectWorkflow = (msgId: string, wf: WorkflowMatch) => {
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, selectedWorkflow: wf, params: wf.inferred_params || {} } : m));
  };

  const setParam = (msgId: string, key: string, value: any) => {
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, params: { ...m.params, [key]: value } } : m));
  };

  const setSampleSheet = (msgId: string, id: string) => {
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, sampleSheetId: id } : m));
  };

  const renderWorkflowUI = (msg: Message) => {
    if (!msg.response || msg.response.mode !== 'workflow_match') return null;
    const { matched_workflows, available_sample_sheets } = msg.response;
    
    return (
      <div className="mt-4 space-y-3">
        {matched_workflows?.map(wf => (
          <div key={wf.template_id} onClick={() => selectWorkflow(msg.id, wf)}
            className={`p-3 rounded-lg border cursor-pointer ${msg.selectedWorkflow?.template_id === wf.template_id ? 'border-emerald-500 bg-emerald-500/10' : 'border-gray-700 hover:border-gray-600'}`}>
            <div className="flex justify-between text-sm">
              <span className="text-white">{wf.template_name}</span>
              <span className={wf.match_score >= 0.8 ? 'text-emerald-400' : 'text-yellow-400'}>{Math.round(wf.match_score * 100)}%</span>
            </div>
            <p className="text-xs text-gray-400 mt-1">{wf.description}</p>
          </div>
        ))}
        
        {available_sample_sheets && available_sample_sheets.length > 0 && (
          <select value={msg.sampleSheetId || ''} onChange={e => setSampleSheet(msg.id, e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white">
            {available_sample_sheets.map(ss => <option key={ss.id} value={ss.id}>{ss.name}</option>)}
          </select>
        )}
        
        {msg.selectedWorkflow?.params_schema?.properties && (
          <div className="space-y-2 bg-gray-800/50 p-3 rounded-lg">
            {Object.entries(msg.selectedWorkflow.params_schema.properties).map(([key, schema]: [string, any]) => (
              <div key={key} className="flex items-center gap-2 text-sm">
                <label className="text-gray-400 w-28">{schema.title || key}</label>
                {schema.type === 'boolean' ? (
                  <input type="checkbox" checked={msg.params?.[key] ?? schema.default ?? false} onChange={e => setParam(msg.id, key, e.target.checked)} />
                ) : (
                  <input type="text" value={msg.params?.[key] ?? schema.default ?? ''} onChange={e => setParam(msg.id, key, e.target.value)}
                    className="flex-1 bg-gray-700 rounded px-2 py-1 text-white" />
                )}
              </div>
            ))}
          </div>
        )}
        
        <button onClick={() => handleExecute(msg)} disabled={executingId === msg.id}
          className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-700 text-white py-2 rounded-lg">
          {executingId === msg.id ? '执行中...' : '🚀 确认执行'}
        </button>
      </div>
    );
  };

  const renderCodeUI = (msg: Message) => {
    if (!msg.response || msg.response.mode !== 'code_generation') return null;
    return (
      <div className="mt-4 space-y-3">
        <pre className="bg-gray-950 border border-gray-700 rounded p-3 text-xs text-gray-300 max-h-40 overflow-auto">{msg.response.generated_code}</pre>
        <button onClick={() => handleExecute(msg)} disabled={executingId === msg.id}
          className="w-full bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700 text-white py-2 rounded-lg">
          {executingId === msg.id ? '执行中...' : '🚀 执行'}
        </button>
      </div>
    );
  };

  const formatDate = (d: string) => {
    const diff = Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
    return diff === 0 ? '今天' : diff === 1 ? '昨天' : `${diff}天前`;
  };

  return (
    <div className="flex h-full bg-gray-900 rounded-xl overflow-hidden">
      {sidebarOpen && (
        <div className="w-60 bg-gray-950 border-r border-gray-800 flex flex-col flex-shrink-0">
          <div className="p-3 border-b border-gray-800">
            <button onClick={createConversation} className="w-full bg-purple-600 hover:bg-purple-500 text-white py-2 rounded-lg text-sm">+ 新对话</button>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {!loaded ? <div className="text-gray-500 text-sm text-center py-8">加载中...</div> :
             conversations.length === 0 ? <div className="text-gray-500 text-sm text-center py-8">暂无对话</div> :
             conversations.map(c => (
              <div key={c.id} onClick={() => setCurrentId(c.id)}
                className={`group relative p-3 rounded-lg cursor-pointer ${currentId === c.id ? 'bg-gray-800 border border-gray-700' : 'hover:bg-gray-800/50'}`}>
                <div className="text-sm text-white truncate pr-5">{c.title}</div>
                <div className="text-xs text-gray-500">{formatDate(c.updated_at)} · {c.message_count}条</div>
                <button onClick={e => deleteConversation(c.id, e)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 text-lg">×</button>
              </div>
            ))}
          </div>
        </div>
      )}
      
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center px-4 py-2 border-b border-gray-800">
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="text-gray-400 hover:text-white mr-4">{sidebarOpen ? '◀' : '▶'}</button>
          <span className="text-sm text-gray-400 truncate">{conversations.find(c => c.id === currentId)?.title || 'Bio-Copilot'}</span>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {!loaded ? <div className="text-center text-gray-500 py-8">加载中...</div> :
           messages.length === 0 ? <div className="text-center text-gray-500 py-8">🤖 点击"新对话"开始</div> :
           messages.map(m => (
            <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] p-3 rounded-xl ${m.role === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-800 border border-gray-700'}`}>
                <div className="text-sm prose prose-invert prose-sm max-w-none [&_table]:w-full [&_th]:border-b [&_th]:p-2 [&_td]:border-b [&_td]:p-2">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                </div>
                {m.role === 'assistant' && m.response?.mode === 'workflow_match' && renderWorkflowUI(m)}
                {m.role === 'assistant' && m.response?.mode === 'code_generation' && renderCodeUI(m)}
                {m.role === 'assistant' && m.response?.mode === 'clarification_needed' && m.response.follow_up_questions && (
                  <div className="mt-3 text-sm text-yellow-400">
                    {m.response.follow_up_questions.map((q, i) => <div key={i}>• {q}</div>)}
                  </div>
                )}
              </div>
            </div>
          ))}
          {loading && <div className="text-gray-400 text-sm">AI 思考中...</div>}
          <div ref={scrollRef} />
        </div>
        
        <div className="p-3 border-t border-gray-800 flex gap-2">
          <textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleAnalyze())}
            placeholder="描述分析需求..." className="flex-1 bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white resize-none" rows={2} disabled={loading} />
          <button onClick={handleAnalyze} disabled={!input.trim() || loading} className="bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700 text-white px-4 rounded-lg">发送</button>
        </div>
      </div>
    </div>
  );
}
