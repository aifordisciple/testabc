'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import toast from 'react-hot-toast';

interface CopilotPanelProps {
  projectId: string;
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
}

interface FullscreenPreview {
  type: 'image' | 'table' | 'pdf';
  data: string;
  name: string;
}

export default function CopilotPanel({ projectId }: CopilotPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [streamingPlan, setStreamingPlan] = useState<string | null>(null);
  
  const [sessions, setSessions] = useState<string[]>(['default']);
  const [currentSession, setCurrentSession] = useState('default');
  
  const [fullscreenPreview, setFullscreenPreview] = useState<FullscreenPreview | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const prevMsgCountRef = useRef(0);

  const fetchSessions = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/ai/projects/${projectId}/chat/sessions`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setSessions(data.sessions);
      }
    } catch (e) { console.error(e); }
  }, [projectId]);

  const fetchHistory = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/ai/projects/${projectId}/chat/history?session_id=${currentSession}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setMessages(data);
      }
    } catch (e) { console.error(e); }
  }, [projectId, currentSession]);

  useEffect(() => {
    fetchSessions();
    fetchHistory();
  }, [fetchSessions, fetchHistory]);

  useEffect(() => {
    const interval = setInterval(fetchHistory, 5000);
    return () => clearInterval(interval);
  }, [fetchHistory]);

  useEffect(() => {
    if (messages.length > prevMsgCountRef.current) {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        prevMsgCountRef.current = messages.length;
    }
  }, [messages]);

  const handleNewSession = () => {
      const newId = `chat-${Date.now()}`;
      setSessions(prev => [newId, ...prev]);
      setCurrentSession(newId);
      setMessages([]);
      prevMsgCountRef.current = 0;
  };

  const handleSendStream = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMsg = input;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
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
                  setMessages(prev => [...prev, { 
                    role: 'assistant', 
                    content: accumulatedContent || 'I have created an analysis plan for you.',
                    plan_data: accumulatedPlan
                  }]);
                  setStreamingContent('');
                  setStreamingPlan(null);
                  break;
                  
                case 'error':
                  toast.error(data.message);
                  setMessages(prev => [...prev, { 
                    role: 'assistant', 
                    content: `❌ **Error**: ${data.message}` 
                  }]);
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
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: "❌ **Error**: Connection failed. Please try again." 
      }]);
      setStreamingContent('');
      setStreamingPlan(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmPlan = async (planDataStr: string) =>    const toastId = toast.loading('Submitting task to cluster...')
    try {
        const token = localStorage.getItem('token')
        const plan = JSON.parse(planDataStr)
        const planType = plan.type || 'single'
        
        if (planType === 'multi') {
            const res = await fetch(
                `${process.env.NEXT_PUBLIC_API_URL}/ai/projects/${projectId}/chat/execute-chain`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ plan_data: plan, session_id: currentSession })
                })
                
                if (!res.ok) {
                    const errData = await res.json()
                    throw new Error(errData.detail || 'Failed to execute chain')
                }
                
                toast.success('Task chain submitted successfully!', { id: toastId })
            } catch (e: any) {
                toast.error(e.message, { id: toastId, duration: 6000 })
            }
        } else        
        const toastId = toast.loading('Submitting task to cluster...')
        try {
            const token = localStorage.getItem('token')
            const plan = JSON.parse(planDataStr)
            
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/ai/projects/${projectId}/chat/execute-plan`,                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ plan_data: plan, session_id: currentSession })
            })
            
            if (!res.ok) {
                const errData = await res.json()
                throw new Error(errData.detail || 'Failed to execute plan')
            }
            
            toast.success('Task submitted successfully!', { id: toastId })
            await fetchHistory() 
        } catch (e: any) {
            toast.error(e.message, { id: toastId, duration: 6000 })
        }
    }

      
      toast.success('Task submitted successfully!', { id: toastId });
      await fetchHistory(); 
    } catch (e: any) {
      toast.error(e.message, { id: toastId, duration: 6000 });
    }
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
              <div key={idx} className="bg-gray-900 rounded-xl p-4 border border-gray-700">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-400 flex items-center gap-2">
                    <span>📊</span> {att.name}
                  </span>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => setFullscreenPreview({ type: 'image', data: att.data!, name: att.name })}
                      className="text-blue-400 text-xs hover:underline flex items-center gap-1"
                    >
                      🔍 Fullscreen
                    </button>
                    <button 
                      onClick={() => att.data && downloadFile(att.data, att.name)}
                      className="text-blue-400 text-xs hover:underline flex items-center gap-1"
                    >
                      ⬇️ Download
                    </button>
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
              <div key={idx} className="bg-gray-900 rounded-xl p-4 border border-gray-700">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-400 flex items-center gap-2">
                    <span>📄</span> {att.name}
                  </span>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => setFullscreenPreview({ type: 'table', data: att.preview || '', name: att.name })}
                      className="text-blue-400 text-xs hover:underline flex items-center gap-1"
                    >
                      🔍 View All
                    </button>
                  </div>
                </div>
                <div className="overflow-x-auto max-h-48 text-xs text-gray-300 font-mono bg-gray-950 rounded p-2">
                  <table className="w-full">
                    <tbody>
                      {lines.map((row, i) => (
                        <tr key={i} className="border-b border-gray-800">
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
              <div key={idx} className="bg-gray-900 rounded-xl p-4 border border-gray-700">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-400 flex items-center gap-2">
                    <span>📕</span> {att.name}
                  </span>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => setFullscreenPreview({ type: 'pdf', data: att.data!, name: att.name })}
                      className="text-blue-400 text-xs hover:underline flex items-center gap-1"
                    >
                      🔍 Preview
                    </button>
                    <button 
                      onClick={() => att.data && downloadFile(att.data, att.name)}
                      className="text-blue-400 text-xs hover:underline flex items-center gap-1"
                    >
                      ⬇️ Download
                    </button>
                  </div>
                </div>
                <div className="bg-gray-950 rounded-lg p-6 text-center">
                  <div className="text-4xl mb-2">📕</div>
                  <div className="text-sm text-gray-400">{att.name}</div>
                  <div className="text-xs text-gray-500 mt-1">Click Preview to view or Download to save</div>
                </div>
              </div>
            );
          }

          return null;
        })}
      </div>
    );
  };

  const renderPlanCard = (planDataStr: string) => {
    let plan;
    try { plan = JSON.parse(planDataStr); } catch { return null; }

    return (
      <div className="mt-4 bg-gradient-to-br from-gray-900 via-gray-900 to-gray-800 border border-emerald-500/30 rounded-2xl shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500"></div>
        
        <div className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center">
              <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
            </div>
            <div>
              <h4 className="text-lg font-bold text-white">Analysis Strategy</h4>
              <p className="text-xs text-emerald-400">Review and confirm to execute</p>
            </div>
          </div>
          
          <div className="bg-gray-950/50 rounded-xl p-4 mb-5 border border-gray-700/50">
            <div className="flex items-start gap-2">
              <span className="text-lg">💡</span>
              <p className="text-gray-300 text-sm leading-relaxed flex-1">{plan.strategy}</p>
            </div>
          </div>
          
          <div className="mb-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 rounded-full bg-blue-400"></div>
              <span className="text-xs text-gray-400 uppercase tracking-wider font-semibold">Execution Method</span>
            </div>
            
            {plan.method === 'workflow' ? (
              <div className="flex items-center gap-3 bg-blue-500/10 border border-blue-500/30 rounded-xl p-4">
                <div className="w-12 h-12 rounded-lg bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                  <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                </div>
                <div>
                  <div className="text-xs text-blue-300 mb-1">Predefined Pipeline</div>
                  <div className="text-white font-mono font-semibold">{plan.workflow_name}</div>
                </div>
              </div>
            ) : (
              <div className="bg-purple-500/10 border border-purple-500/30 rounded-xl overflow-hidden">
                <div className="flex items-center gap-3 p-4 border-b border-purple-500/20">
                  <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                    </svg>
                  </div>
                  <div>
                    <div className="text-xs text-purple-300">Custom Python Code</div>
                    <div className="text-white text-sm">Sandbox Environment</div>
                  </div>
                </div>
                <div className="relative">
                  <div className="absolute top-2 left-0 right-0 flex items-center justify-between px-4 z-10">
                    <span className="text-[10px] text-gray-500 font-mono">python</span>
                    <div className="flex gap-1">
                      <div className="w-2 h-2 rounded-full bg-red-500/50"></div>
                      <div className="w-2 h-2 rounded-full bg-yellow-500/50"></div>
                      <div className="w-2 h-2 rounded-full bg-green-500/50"></div>
                    </div>
                  </div>
                  <pre className="bg-[#0d1117] p-4 pt-8 text-xs text-green-400 font-mono overflow-x-auto max-h-64 overflow-y-auto leading-relaxed">
                    <code>{plan.custom_code}</code>
                  </pre>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button 
              onClick={() => handleConfirmPlan(planDataStr)} 
              className="flex-1 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white px-5 py-3 rounded-xl text-sm font-semibold transition-all shadow-lg shadow-emerald-500/25 flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Execute Analysis
            </button>
          </div>
        </div>
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
            <h3 className="text-white font-medium">{fullscreenPreview.name}</h3>
            <button 
              onClick={() => setFullscreenPreview(null)}
              className="text-gray-400 hover:text-white text-2xl"
            >
              ✕
            </button>
          </div>
          
          {fullscreenPreview.type === 'image' && (
            <img 
              src={fullscreenPreview.data} 
              alt={fullscreenPreview.name}
              className="max-w-full max-h-[85vh] mx-auto rounded-lg shadow-2xl"
            />
          )}
          
          {fullscreenPreview.type === 'table' && (
            <div className="bg-gray-900 rounded-xl p-6 max-h-[85vh] overflow-auto">
              <table className="w-full text-sm text-gray-300 font-mono">
                <tbody>
                  {fullscreenPreview.data.split('\n').map((row, i) => (
                    <tr key={i} className="border-b border-gray-800">
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
            <div className="bg-gray-900 rounded-xl max-h-[85vh] overflow-hidden">
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
    return (
      <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2`}>
        <div className={`max-w-[85%] rounded-2xl px-5 py-3 ${
          msg.role === 'user' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'bg-gray-800 text-gray-200 border border-gray-700 shadow-md'
        }`}>
          <div className={`prose prose-sm max-w-none ${msg.role === 'user' ? 'prose-invert' : 'prose-invert prose-blue'}`}>
            <ReactMarkdown
              urlTransform={(value: string) => value}
              components={{
                img: ({node, ...props}) => (
                  <div className="my-4 bg-[#0d1117] p-3 rounded-xl border border-gray-700/50 inline-block shadow-inner">
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
    <div className="flex flex-col h-full bg-[#0d1117]">
      <div className="p-4 border-b border-gray-800 bg-gray-900/50 flex justify-between items-center shadow-sm">
        <div className="flex items-center gap-3">
            <span className="text-2xl animate-pulse">✨</span>
            <div>
              <h3 className="font-bold text-white text-lg">Bio-Copilot</h3>
              <p className="text-xs text-blue-400 font-medium">Your AI Bioinformatics Planner</p>
            </div>
        </div>
        <div className="flex items-center gap-2">
            <select 
                className="bg-gray-800 border border-gray-700 text-gray-300 text-xs rounded-lg px-2 py-1.5 outline-none focus:border-blue-500"
                value={currentSession}
                onChange={(e) => { setCurrentSession(e.target.value); prevMsgCountRef.current=0; }}
            >
                {sessions.map(s => <option key={s} value={s}>{s === 'default' ? 'Main Session' : `Chat (${s.slice(-6)})`}</option>)}
            </select>
            <button onClick={handleNewSession} className="bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 text-xs px-3 py-1.5 rounded-lg border border-blue-900/50 transition-colors">
                + New
            </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin">
        {messages.length === 0 && !streamingContent ? (
          <div className="h-full flex flex-col items-center justify-center text-center opacity-50">
            <span className="text-5xl mb-4">🧬</span>
            <p className="text-gray-400">Ask about your files, or request an analysis pipeline.</p>
          </div>
        ) : (
          <>
            {messages.map((msg, idx) => renderMessage(msg, idx))}
            
            {streamingContent && (
              <div className="flex justify-start animate-in fade-in">
                <div className="max-w-[85%] rounded-2xl px-5 py-3 bg-gray-800 text-gray-200 border border-gray-700 shadow-md">
                  <div className="prose prose-sm max-w-none prose-invert prose-blue">
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
            <div className="bg-gray-800 border border-gray-700 rounded-2xl px-5 py-4 flex items-center gap-3">
              <span className="relative flex h-3 w-3"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span><span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500"></span></span>
              <span className="text-gray-400 text-sm animate-pulse">Thinking...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 bg-gray-900 border-t border-gray-800">
        <form onSubmit={handleSendStream} className="relative max-w-4xl mx-auto flex items-end bg-[#0f1218] border border-gray-700 rounded-xl overflow-hidden focus-within:border-blue-500 transition-all shadow-inner">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendStream(e); } }}
            placeholder="E.g., What files do I have? OR Plot a PCA from data.csv..."
            className="w-full bg-transparent text-white px-4 py-4 max-h-32 outline-none resize-none placeholder-gray-500 text-sm"
            rows={1}
          />
          <div className="p-2 flex-shrink-0">
            <button type="submit" disabled={!input.trim() || isLoading} className="p-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg transition-colors shadow-md">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
            </button>
          </div>
        </form>
      </div>

      {renderFullscreenPreview()}
    </div>
  );
}
