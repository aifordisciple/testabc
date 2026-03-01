'use client';

import { type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';

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
  return (
    <div className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'} animate-stagger-fade`}>
      <div
        className={`max-w-[85%] rounded-2xl px-5 py-3 ${
          message.role === 'user'
            ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20'
            : 'bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-default)] shadow-md'
        }`}
      >
        <div
          className={`prose prose-sm max-w-none ${
            message.role === 'user' ? 'prose-invert' : 'prose-invert prose-blue'
          }`}
        >
          <ReactMarkdown
            urlTransform={(value: string) => value}
            components={{
              img: ({ ...props }) => (
                <div className="my-4 bg-[var(--bg-muted)] p-3 rounded-xl border border-[var(--border-subtle)] inline-block shadow-inner">
                  <img {...props} className="max-w-full h-auto rounded-lg cursor-pointer hover:opacity-90" alt="" />
                </div>
              ),
            }}
          >
            {message.content}
          </ReactMarkdown>
        </div>
        {message.plan_data && renderPlanCard && renderPlanCard(message.plan_data)}
        {message.attachments && renderAttachments && renderAttachments(message.attachments)}
      </div>
    </div>
  );
}
