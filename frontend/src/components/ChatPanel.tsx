'use client';

import { useState, useRef, useEffect } from 'react';

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface ChatPanelProps {
  messages: Message[]; // 👈 接收父组件传入的历史
  onSend: (prompt: string) => Promise<void>;
  isGenerating: boolean;
}

export default function ChatPanel({ messages, onSend, isGenerating }: ChatPanelProps) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isGenerating]); // 当消息更新或正在生成时滚动

  const handleSubmit = async () => {
    if (!input.trim() || isGenerating) return;
    const userMsg = input.trim();
    setInput('');
    // 这里只触发回调，UI 更新由父组件控制
    await onSend(userMsg);
  };

  return (
    <div className="flex flex-col h-full bg-[#1e1e1e]">
      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg, idx) => (
          <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div 
              className={`max-w-[90%] rounded-xl p-3 text-sm whitespace-pre-wrap leading-relaxed shadow-sm ${
                msg.role === 'user' 
                  ? 'bg-blue-600 text-white rounded-br-none' 
                  : msg.role === 'system'
                    ? 'bg-gray-800/50 text-gray-500 text-xs text-center w-full italic py-2'
                    : 'bg-gray-700 text-gray-100 rounded-bl-none border border-gray-600'
              }`}
            >
              {msg.role === 'assistant' && (
                <div className="text-[10px] uppercase text-blue-400 font-bold mb-1 tracking-wider">AI Architect</div>
              )}
              {msg.content}
            </div>
          </div>
        ))}
        
        {isGenerating && (
           <div className="flex justify-start">
             <div className="bg-gray-700/50 border border-gray-600/50 text-gray-300 rounded-xl rounded-bl-none p-4 text-sm flex items-center gap-3">
                <div className="flex gap-1">
                    <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce"></span>
                    <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce delay-75"></span>
                    <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce delay-150"></span>
                </div>
                <span className="text-xs font-mono animate-pulse">Thinking & Coding...</span>
             </div>
           </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 border-t border-gray-700 bg-gray-900">
        <div className="relative">
          <textarea
            className="w-full bg-gray-800 text-white text-sm rounded-lg pl-3 pr-10 py-3 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none scrollbar-hide border border-gray-700 placeholder-gray-500"
            rows={2}
            placeholder="Type your instruction here..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            disabled={isGenerating}
          />
          <button
            onClick={handleSubmit}
            disabled={!input.trim() || isGenerating}
            className="absolute right-2 bottom-2 p-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-md disabled:opacity-50 transition-colors shadow-lg"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
          </button>
        </div>
      </div>
    </div>
  );
}