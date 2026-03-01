'use client';

import { motion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { User, Bot } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { TaskProposalCard } from './task-proposal-card';

interface ChatMessageProps {
  role: 'user' | 'assistant';
  content: string;
  planData?: string | null;
  attachments?: string | null;
  createdAt?: string;
  onConfirmPlan?: () => void;
  isExecuting?: boolean;
}

export function ChatMessage({
  role,
  content,
  planData,
  attachments,
  createdAt,
  onConfirmPlan,
  isExecuting,
}: ChatMessageProps) {
  const isUser = role === 'user';
  let parsedPlan = null;
  
  if (planData) {
    try {
      parsedPlan = JSON.parse(planData);
    } catch {
      // ignore
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "flex gap-4",
        isUser ? "flex-row-reverse" : "flex-row"
      )}
    >
      <Avatar className={cn(
        "w-8 h-8 flex-shrink-0",
        isUser ? "bg-primary/20" : "bg-muted"
      )}>
        <AvatarFallback className={cn(
          "text-xs font-semibold",
          isUser ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
        )}>
          {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
        </AvatarFallback>
      </Avatar>

      <div className={cn(
        "flex-1 max-w-[85%] space-y-3",
        isUser ? "items-end" : "items-start"
      )}>
        <div className={cn(
          "rounded-2xl px-4 py-3",
          isUser
            ? "bg-primary text-primary-foreground rounded-tr-md"
            : "bg-muted/50 border border-border/50 rounded-tl-md"
        )}>
          <div className={cn(
            "prose prose-sm max-w-none",
            isUser ? "prose-invert" : "prose-neutral dark:prose-invert",
            "[&_p]:my-0 [&_p]:leading-relaxed",
            "[&_ul]:my-1 [&_ol]:my-1",
            "[&_li]:my-0.5",
            "[&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:bg-muted/50 [&_code]:text-xs",
            "[&_pre]:my-2 [&_pre]:p-3 [&_pre]:rounded-lg [&_pre]:bg-muted/50",
            "[&_a]:text-primary [&_a]:no-underline hover:[&_a]:underline"
          )}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {content}
            </ReactMarkdown>
          </div>
        </div>

        {parsedPlan && onConfirmPlan && (
          <TaskProposalCard
            planData={parsedPlan}
            onConfirm={onConfirmPlan}
            isExecuting={isExecuting}
          />
        )}

        {createdAt && (
          <div className={cn(
            "text-[10px] text-muted-foreground/60",
            isUser ? "text-right" : "text-left"
          )}>
            {new Date(createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
        )}
      </div>
    </motion.div>
  );
}

interface StreamingMessageProps {
  content: string;
  planData?: string | null;
}

export function StreamingMessage({ content, planData }: StreamingMessageProps) {
  let parsedPlan = null;
  
  if (planData) {
    try {
      parsedPlan = JSON.parse(planData);
    } catch {
      // ignore
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex gap-4"
    >
      <Avatar className="w-8 h-8 flex-shrink-0 bg-muted">
        <AvatarFallback className="bg-muted text-muted-foreground">
          <Bot className="w-4 h-4" />
        </AvatarFallback>
      </Avatar>

      <div className="flex-1 max-w-[85%] space-y-3">
        <div className="rounded-2xl rounded-tl-md px-4 py-3 bg-muted/50 border border-border/50">
          <div className="prose prose-sm max-w-none prose-neutral dark:prose-invert [&_p]:my-0 [&_p]:leading-relaxed">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {content || '...'}
            </ReactMarkdown>
            {!content && (
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            )}
          </div>
        </div>

        {parsedPlan && (
          <TaskProposalCard
            planData={parsedPlan}
            onConfirm={() => {}}
          />
        )}
      </div>
    </motion.div>
  );
}
