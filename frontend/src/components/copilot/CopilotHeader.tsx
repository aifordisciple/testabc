'use client';

import { FlaskConical, MessageSquare, Plus, ChevronDown } from 'lucide-react';
import { useLocale } from '@/stores/localeStore';

interface CopilotHeaderProps {
  sessions: Array<{ id: string; title: string }>;
  currentSession: string;
  onSelectSession: (sessionId: string) => void;
  onNewSession: () => void;
}

export function CopilotHeader({ 
  sessions, 
  currentSession, 
  onSelectSession, 
  onNewSession 
}: CopilotHeaderProps) {
  const { locale } = useLocale();
  
  const currentTitle = sessions.find(s => s.id === currentSession)?.title || 
    (locale === 'en' ? 'New Chat' : '新对话');

  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
          <FlaskConical className="w-4 h-4 text-primary" />
        </div>
        <span className="font-semibold text-sm">AI Copilot</span>
        
        <div className="relative ml-2">
          <select
            value={currentSession}
            onChange={(e) => onSelectSession(e.target.value)}
            className="appearance-none bg-background border border-border rounded-lg px-3 py-1.5 pr-8 text-sm cursor-pointer hover:border-primary/50 transition-colors"
          >
            {sessions.map(session => (
              <option key={session.id} value={session.id}>
                {session.title || (locale === 'en' ? 'New Chat' : '新对话')}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        </div>
      </div>
      
      <button
        onClick={onNewSession}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-sm font-medium hover:bg-primary/20 transition-colors"
      >
        <Plus className="w-4 h-4" />
        <span className="hidden sm:inline">
          {locale === 'en' ? 'New' : '新建'}
        </span>
      </button>
    </div>
  );
}
