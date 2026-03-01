'use client';

import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { User, Bot } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { CodeBlock } from '@/components/ui/CodeBlock';
import type { ReactNode } from 'react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  plan_data?: string | null;
  attachments?: string | null;
  created_at?: string;
}

interface MessageItemProps {
  message: Message;
  renderPlanCard?: (planData: string) => ReactNode;
  renderAttachments?: (attachments: string | null) => ReactNode;
}

export function MessageItem({ message, renderPlanCard, renderAttachments }: MessageItemProps) {
  const isUser = message.role === 'user';

  return (
    <div
      className={`flex w-full mb-6 group animate-in fade-in slide-in-from-bottom-2 ${
        isUser ? 'justify-end' : 'justify-start'
      }`}
    >
      <div className={`flex gap-3 max-w-[90%] md:max-w-[80%] ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
        {/* Avatar */}
        <Avatar className="w-8 h-8 shrink-0 border border-gray-200 dark:border-gray-700 shadow-sm">
          <AvatarFallback
            className={
              isUser
                ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/50 dark:text-blue-400'
                : 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/50 dark:text-emerald-400'
            }
          >
            {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
          </AvatarFallback>
        </Avatar>

        {/* Message Bubble */}
        <div
          className={`relative px-5 py-3.5 rounded-2xl shadow-sm text-sm leading-relaxed ${
            isUser
              ? 'bg-blue-600 text-white rounded-tr-sm'
              : 'bg-white text-gray-900 border border-gray-200 rounded-tl-sm dark:bg-[#1e232b] dark:text-gray-100 dark:border-gray-800'
          }`}
        >
          {/* Markdown Content */}
          <div
            className={
              isUser
                ? 'prose prose-sm max-w-none prose-invert prose-p:text-white prose-headings:text-white prose-strong:text-white prose-a:text-blue-200'
                : 'prose prose-sm max-w-none prose-slate dark:prose-invert prose-p:leading-relaxed'
            }
          >
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              urlTransform={(value: string) => value}
              components={{
                img: ({ node, ...props }) => (
                  <div className="my-4 bg-gray-50 dark:bg-[#0d1117] p-2 rounded-xl border border-gray-200 dark:border-gray-700/50 inline-block shadow-inner">
                    <img {...props} className="max-w-full h-auto rounded-lg" alt="AI Generated Graphic" />
                  </div>
                ),
                code: ({ node, inline, className, children, ...props }: any) => {
                  const match = /language-(\w+)/.exec(className || '');
                  if (!inline && match) {
                    return <CodeBlock code={String(children).replace(/\n$/, '')} language={match[1]} />;
                  }
                  return (
                    <code
                      className="bg-black/5 dark:bg-white/10 px-1.5 py-0.5 rounded text-red-500 dark:text-pink-400 font-mono text-[0.9em]"
                      {...props}
                    >
                      {children}
                    </code>
                  );
                },
              }}
            >
              {message.content}
            </ReactMarkdown>
          </div>

          {/* Plan Card */}
          {message.plan_data && renderPlanCard && (
            <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700/50">
              {renderPlanCard(message.plan_data)}
            </div>
          )}

          {/* Attachments */}
          {message.attachments && renderAttachments && (
            <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700/50">
              {renderAttachments(message.attachments)}
            </div>
          )}

          {/* Timestamp */}
          {message.created_at && (
            <div className={`text-[11px] mt-2 ${isUser ? 'text-blue-100 text-right' : 'text-gray-400 dark:text-gray-500'}`}>
              {new Date(message.created_at).toLocaleString()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
