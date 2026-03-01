'use client';

import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Send, Paperclip, Loader2, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  isLoading?: boolean;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export function ChatInput({
  value,
  onChange,
  onSubmit,
  isLoading = false,
  placeholder = 'Type your message...',
  className,
  disabled = false,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [value]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (value.trim() && !isLoading && !disabled) {
        onSubmit(e);
      }
    }
  };

  return (
    <form onSubmit={onSubmit} className={cn("relative", className)}>
      <motion.div
        animate={{
          boxShadow: isFocused
            ? '0 0 0 2px hsl(var(--primary) / 0.2), 0 0 20px hsl(var(--primary) / 0.1)'
            : '0 0 0 0 transparent',
        }}
        transition={{ duration: 0.2 }}
        className={cn(
          "relative rounded-2xl",
          "bg-card/80 backdrop-blur-xl",
          "border border-border/50",
          "transition-all duration-200",
          isFocused && "border-primary/50"
        )}
      >
        <div className="flex items-end gap-2 p-3">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="flex-shrink-0 text-muted-foreground hover:text-foreground"
            disabled={disabled || isLoading}
          >
            <Paperclip className="w-5 h-5" />
          </Button>

          <Textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder={placeholder}
            disabled={disabled || isLoading}
            rows={1}
            className={cn(
              "flex-1 resize-none border-0 bg-transparent",
              "focus-visible:ring-0 focus-visible:ring-offset-0",
              "placeholder:text-muted-foreground/60",
              "min-h-[40px] max-h-[200px] py-2"
            )}
          />

          <Button
            type="submit"
            size="icon"
            disabled={!value.trim() || isLoading || disabled}
            className={cn(
              "flex-shrink-0 rounded-xl",
              "transition-all duration-200",
              value.trim() && !isLoading && "shadow-lg shadow-primary/20"
            )}
          >
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </Button>
        </div>

        <div className="absolute bottom-1 left-14 right-14 flex items-center gap-2 pointer-events-none">
          {!isFocused && !value && (
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-[10px] text-muted-foreground/50"
            >
              Press Enter to send, Shift+Enter for new line
            </motion.span>
          )}
        </div>
      </motion.div>

      {isLoading && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute -top-12 left-1/2 -translate-x-1/2"
        >
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20">
            <Sparkles className="w-3.5 h-3.5 text-primary animate-pulse" />
            <span className="text-xs text-primary font-medium">AI is thinking...</span>
          </div>
        </motion.div>
      )}
    </form>
  );
}
