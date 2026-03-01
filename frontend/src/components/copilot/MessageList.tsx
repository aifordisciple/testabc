'use client';

import { useRef, useEffect, type ReactNode } from 'react';
import { MessageItem } from './MessageItem';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  plan_data?: string | null;
  attachments?: string | null;
  created_at?: string;
}

interface MessageListProps {
  messages: Message[];
  hasMore: boolean;
  isLoadingMore: boolean;
  streamingContent: string;
  streamingPlan: string | null;
  isLoading: boolean;
  onScroll: (e: React.UIEvent<HTMLDivElement>) => void;
  renderPlanCard: (planData: string) => ReactNode;
  renderAttachments: (attachments: string | null) => ReactNode;
  renderStreamingPlan?: (planData: string) => ReactNode;
}

export function MessageList({
  messages,
  hasMore,
  isLoadingMore,
  streamingContent,
  streamingPlan,
  isLoading,
  onScroll,
  renderPlanCard,
  renderAttachments,
  renderStreamingPlan,
}: MessageListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const prevMsgCountRef = useRef(0);
  const isInitialLoadRef = useRef(true);

  useEffect(() => {
    if (messages.length > prevMsgCountRef.current) {
      messagesEndRef.current?.scrollIntoView({
        behavior: isInitialLoadRef.current ? 'auto' : 'smooth',
      });
      prevMsgCountRef.current = messages.length;
      isInitialLoadRef.current = false;
    }
  }, [messages.length]);

  return (
    <div onScroll={onScroll} className="flex-1 overflow-y-auto p-6 space-y-6">
      {hasMore && (
        <div className="text-center py-2">
          {isLoadingMore ? (
            <span className="text-[var(--text-muted)] text-sm">Loading older messages...</span>
          ) : (
            <button className="text-blue-400 text-sm hover:underline">
              Load older messages
            </button>
          )}
        </div>
      )}

      {messages.length === 0 && !streamingContent ? (
        <div className="h-full flex flex-col items-center justify-center text-center opacity-50">
          <span className="text-5xl mb-4">🧬</span>
          <p className="text-[var(--text-secondary)]">
            Ask about your files, or request an analysis pipeline.
          </p>
        </div>
      ) : (
        <>
          {messages.map((msg, idx) => (
            <MessageItem
              key={idx}
              message={msg}
              renderPlanCard={renderPlanCard}
              renderAttachments={renderAttachments}
            />
          ))}

          {streamingContent && (
            <div className="flex justify-start animate-fade-in">
              <div className="max-w-[85%] rounded-2xl px-5 py-3 bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-default)] shadow-md">
                <div className="prose prose-sm max-w-none prose-invert prose-blue">
                  {streamingContent}
                </div>
                {streamingPlan && renderStreamingPlan && renderStreamingPlan(streamingPlan)}
              </div>
            </div>
          )}
        </>
      )}

      {isLoading && !streamingContent && (
        <div className="flex justify-start">
          <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-2xl px-5 py-4 flex items-center gap-3">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500" />
            </span>
            <span className="text-[var(--text-secondary)] text-sm animate-pulse">Thinking...</span>
          </div>
        </div>
      )}

      <div ref={messagesEndRef} />
    </div>
  );
}
