'use client';

import { type FormEvent, type KeyboardEvent } from 'react';
import { Send } from 'lucide-react';

interface ChatInputProps {
  input: string;
  isLoading: boolean;
  streamingContent: string;
  onInputChange: (value: string) => void;
  onSubmit: (e: FormEvent) => void;
}

export function ChatInput({ input, isLoading, streamingContent, onInputChange, onSubmit }: ChatInputProps) {
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSubmit(e as unknown as FormEvent);
    }
  };

  const isDisabled = !input.trim() || isLoading || !!streamingContent;

  return (
    <div className="p-4 bg-[var(--bg-elevated)] border-t border-[var(--border-subtle)]">
      <form
        onSubmit={onSubmit}
        className="relative max-w-4xl mx-auto flex items-end bg-[var(--bg-base)] border border-[var(--border-default)] rounded-xl overflow-hidden focus-within:border-blue-500 transition-colors shadow-inner"
      >
        <textarea
          value={input}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about your files, or request an analysis pipeline..."
          className="w-full bg-transparent text-[var(--text-primary)] px-4 py-4 max-h-32 outline-none resize-none placeholder-[var(--text-muted)] text-sm"
          rows={1}
          disabled={isLoading}
        />
        <div className="p-2 flex-shrink-0">
          <button
            type="submit"
            disabled={isDisabled}
            className="p-2 bg-blue-600 hover:bg-blue-500 disabled:bg-[var(--bg-muted)] disabled:text-[var(--text-muted)] text-white rounded-lg transition-colors shadow-md btn-press"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </form>
    </div>
  );
}
