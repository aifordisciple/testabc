'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import toast from 'react-hot-toast';

interface CopilotPanelProps {
  projectId: string;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  plan_data?: string | null;
}

export default function CopilotPanel({ projectId }: CopilotPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  const [sessions, setSessions] = useState<string[]>(['default']);
  const [currentSession, setCurrentSession] = useState('default');
  
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

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMsg = input;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setIsLoading(true);

    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/ai/projects/${projectId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ message: userMsg, session_id: currentSession })
      });

      if (!res.ok) throw new Error('API Error');
      await fetchHistory(); 
    } catch (error) {
      setMessages(prev => [...prev, { role: 'assistant', content: "❌ **Error**: Connection failed." }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmPlan = async (planDataStr: string) => {
    const toastId = toast.loading('Submitting task to cluster...');
    try {
      const token = localStorage.getItem('token');
      const plan = JSON.parse(planDataStr);
      
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/ai/projects/${projectId}/chat/execute-plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ plan_data: plan, session_id: currentSession })
      });
      
      if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.detail || 'Failed to execute plan');
      }
      
      toast.success('Task submitted successfully!', { id: toastId });
      await fetchHistory(); 
    } catch (e: any) {
      toast.error(e.message, { id: toastId, duration: 6000 });
    }
  };

  const renderPlanCard = (planDataStr: string) => {
    let plan;
    try { plan = JSON.parse(planDataStr); } catch { return null; }

    return (
      <div className="mt-4 bg-gray-900 border border-emerald-900/50 rounded-xl p-5 shadow-lg relative overflow-hidden">
         <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500"></div>
         <h4 className="text-lg font-bold text-white mb-2 flex items-center gap-2">📋 Analysis Strategy Proposal</h4>
         <p className="text-gray-300 text-sm mb-4 leading-relaxed">{plan.strategy}</p>
         
         <div className="bg-gray-950 rounded border border-gray-800 p-3 mb-5">
            <div className="text-xs text-gray-500 uppercase font-bold mb-1 tracking-wider">Routing Details</div>
            {plan.method === 'workflow' ? (
                <div><span className="text-blue-400 font-medium">Standard Tool/Pipeline ➔ </span><span className="text-white">{plan.workflow_name}</span></div>
            ) : (
                <div>
                   <span className="text-purple-400 font-medium">Custom Sandbox Code ➔ </span><span className="text-white">Python Env</span>
                   <div className="mt-2 p-2 bg-[#0d1117] rounded text-xs text-green-400 font-mono overflow-x-auto max-h-48">
                     {plan.custom_code}
                   </div>
                </div>
            )}
         </div>

         <div className="flex gap-3">
            <button onClick={() => handleConfirmPlan(planDataStr)} className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                Confirm & Execute
            </button>
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
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center opacity-50">
            <span className="text-5xl mb-4">🧬</span>
            <p className="text-gray-400">Ask about your files, or request an analysis pipeline.</p>
          </div>
        ) : (
          messages.map((msg, idx) => (
            <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2`}>
              <div className={`max-w-[85%] rounded-2xl px-5 py-3 ${
                msg.role === 'user' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'bg-gray-800 text-gray-200 border border-gray-700 shadow-md'
              }`}>
                <div className={`prose prose-sm max-w-none ${msg.role === 'user' ? 'prose-invert' : 'prose-invert prose-blue'}`}>
                  {/* 👇 核心修复：允许 ReactMarkdown 渲染 data: 格式的 Base64 图片，并加上图框样式 */}
                  <ReactMarkdown
                    urlTransform={(value: string) => value}
                    components={{
                      img: ({node, ...props}) => (
                        <div className="my-4 bg-[#0d1117] p-3 rounded-xl border border-gray-700/50 inline-block shadow-inner">
                          <img {...props} className="max-w-full h-auto rounded-lg" alt="AI Generated Graphic" />
                        </div>
                      )
                    }}
                  >
                    {msg.content}
                  </ReactMarkdown>
                </div>
                {msg.plan_data && renderPlanCard(msg.plan_data)}
              </div>
            </div>
          ))
        )}
        
        {isLoading && (
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
        <form onSubmit={handleSend} className="relative max-w-4xl mx-auto flex items-end bg-[#0f1218] border border-gray-700 rounded-xl overflow-hidden focus-within:border-blue-500 transition-all shadow-inner">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(e); } }}
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
    </div>
  );
}