'use client';

import ReactMarkdown from 'react-markdown';
import { Bot, User, Loader2 } from 'lucide-react';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  plan_data?: string | null;
  attachments?: string | null;
  created_at?: string;
}

interface CopilotMessagesProps {
  messages: ChatMessage[];
  isLoading: boolean;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
}

export function CopilotMessages({ messages, isLoading, messagesEndRef }: CopilotMessagesProps) {
  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {messages.length === 0 && !isLoading && (
        <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
          <Bot className="w-12 h-12 mb-4 opacity-50" />
          <p className="text-sm">
            Ask me anything about your bioinformatics analysis
          </p>
          <p className="text-xs mt-2 opacity-70">
            I can help with data processing, visualization, and more
          </p>
        </div>
      )}
      
      {messages.map((msg, idx) => (
        <div
          key={idx}
          className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
        >
          {msg.role === 'assistant' && (
            <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0">
              <Bot className="w-4 h-4 text-primary" />
            </div>
          )}
          
          <div
            className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
              msg.role === 'user'
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground'
            }`}
          >
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown>{msg.content}</ReactMarkdown>
            </div>
          </div>
          
          {msg.role === 'user' && (
            <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
              <User className="w-4 h-4 text-muted-foreground" />
            </div>
          )}
        </div>
      ))}
      
      {isLoading && (
        <div className="flex gap-3 justify-start">
          <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
            <Bot className="w-4 h-4 text-primary" />
          </div>
          <div className="bg-muted rounded-2xl px-4 py-2.5">
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          </div>
        </div>
      )}
      
      <div ref={messagesEndRef} />
    </div>
  );
}
