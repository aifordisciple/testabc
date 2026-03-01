'use client';

import { useState } from 'react';
import { Send, Loader2 } from 'lucide-react';
import { useLocale } from '@/stores/localeStore';

interface CopilotInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  isLoading: boolean;
}

export function CopilotInput({ value, onChange, onSubmit, isLoading }: CopilotInputProps) {
  const { locale } = useLocale();
  const [isFocused, setIsFocused] = useState(false);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSubmit();
    }
  };

  return (
    <div className={`p-4 border-t transition-colors ${
      isFocused ? 'border-primary/50 bg-primary/5' : 'border-border bg-card'
    }`}>
      <div className="flex gap-3 items-end">
        <div className="flex-1 relative">
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder={locale === 'en' ? 'Ask me anything...' : '问我任何问题...'}
            className="w-full resize-none rounded-xl border border-input bg-background px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
            rows={1}
            style={{ minHeight: '48px', maxHeight: '120px' }}
          />
        </div>
        
        <button
          onClick={onSubmit}
          disabled={!value.trim() || isLoading}
          className="flex items-center justify-center w-12 h-12 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          {isLoading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <Send className="w-5 h-5" />
          )}
        </button>
      </div>
      
      <p className="text-xs text-muted-foreground mt-2 text-center">
        {locale === 'en' 
          ? 'Press Enter to send, Shift+Enter for new line' 
          : '按回车发送，Shift+回车换行'}
      </p>
    </div>
  );
}
