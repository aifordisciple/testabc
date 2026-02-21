'use client';

import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import toast from 'react-hot-toast';

interface CopilotPanelProps {
  projectId: string;
}

interface MessageFile {
  type: string;
  name: string;
  data?: string;    // Base64 for images
  content?: string; // Text for CSV/TSV
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  files?: MessageFile[];
}

export default function CopilotPanel({ projectId }: CopilotPanelProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: '👋 **Hello! I am your Bio-Copilot.**\n\nI can access the files in this project. Tell me what you want to analyze or plot. For example:\n- *"Plot a PCA for counts.csv"* \n- *"Show me the first 5 rows of metadata.tsv"*'
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const endOfMessagesRef = useRef<HTMLDivElement>(null);

  // 自动滚动到底部
  useEffect(() => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMsg: Message = { role: 'user', content: input };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);

    try {
      const token = localStorage.getItem('token');
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
      
      // 提取历史记录发送给后端 (为了节省带宽，不发送图片Base64数据)
      const history = newMessages.map(m => ({
        role: m.role,
        content: m.content
      }));

      const res = await fetch(`${apiUrl}/ai/projects/${projectId}/copilot/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ messages: history })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Failed to get response');
      }

      const data = await res.json();
      
      // 后端返回 { reply: string, files: array }
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.reply,
        files: data.files
      }]);

    } catch (e: any) {
      console.error(e);
      toast.error(e.message);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `❌ **Error:** ${e.message}`
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full bg-gray-900 border border-gray-800 rounded-xl overflow-hidden shadow-xl">
      {/* Chat History Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {messages.map((msg, idx) => (
          <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] flex flex-col gap-2 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
              
              {/* Text Bubble */}
              <div 
                className={`p-4 rounded-2xl shadow-md ${
                  msg.role === 'user' 
                    ? 'bg-blue-600 text-white rounded-tr-sm' 
                    : 'bg-gray-800 text-gray-200 border border-gray-700 rounded-tl-sm'
                }`}
              >
                <div className="text-sm leading-relaxed prose-sm md:prose-base 
                  [&>p]:mb-2 [&>p:last-child]:mb-0 
                  [&>pre]:bg-gray-950 [&>pre]:p-3 [&>pre]:rounded-md [&>pre]:overflow-x-auto [&>pre]:my-2
                  [&>table]:w-full [&>table]:text-left [&>table]:border-collapse [&>table]:my-2
                  [&_th]:border-b [&_th]:border-gray-600 [&_th]:p-2 [&_th]:text-gray-300
                  [&_td]:border-b [&_td]:border-gray-700 [&_td]:p-2
                  [&_code]:bg-gray-900 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-emerald-400
                ">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {msg.content}
                  </ReactMarkdown>
                </div>
              </div>

              {/* Render Output Files (Images / Tables) */}
              {msg.files && msg.files.length > 0 && (
                <div className="flex flex-wrap gap-3 mt-2">
                  {msg.files.map((file, fIdx) => (
                    <div key={fIdx} className="bg-gray-950 border border-gray-700 p-2 rounded-lg max-w-full overflow-hidden">
                      <div className="text-xs text-gray-400 mb-2 font-mono flex items-center gap-2 border-b border-gray-800 pb-2">
                        <span>📎 {file.name}</span>
                        {file.type === 'image' && <span className="text-emerald-500">Image Rendered</span>}
                      </div>
                      
                      {file.type === 'image' && file.data && (
                        <img src={file.data} alt={file.name} className="max-w-full h-auto rounded object-contain max-h-[400px]" />
                      )}
                      
                      {file.type === 'text' && file.content && (
                        <pre className="text-[10px] text-gray-300 bg-[#0d1117] p-3 rounded overflow-x-auto max-h-[300px] overflow-y-auto">
                          {file.content}
                        </pre>
                      )}
                    </div>
                  ))}
                </div>
              )}

            </div>
          </div>
        ))}
        
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-gray-800 border border-gray-700 p-4 rounded-2xl rounded-tl-sm flex items-center gap-3 shadow-md">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-purple-500"></span>
              </span>
              <span className="text-sm text-gray-400 font-medium">Bio-Copilot is thinking and executing code...</span>
            </div>
          </div>
        )}
        <div ref={endOfMessagesRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 bg-gray-800/50 border-t border-gray-800 flex gap-3 items-end">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask Copilot to analyze data or generate a plot... (Shift+Enter for new line)"
          className="flex-1 bg-gray-950 border border-gray-700 rounded-xl px-4 py-3 text-sm text-white resize-none max-h-32 focus:border-purple-500 outline-none transition-colors"
          rows={Math.min(5, input.split('\n').length || 1)}
          disabled={isLoading}
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || isLoading}
          className="bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700 disabled:text-gray-500 text-white p-3 rounded-xl transition-all shadow-lg flex-shrink-0"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
        </button>
      </div>
    </div>
  );
}