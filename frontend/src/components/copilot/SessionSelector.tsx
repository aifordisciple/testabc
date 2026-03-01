'use client';

import { Plus, Trash2 } from 'lucide-react';

interface SessionSelectorProps {
  sessions: string[];
  currentSession: string;
  messagesCount: number;
  onSessionChange: (sessionId: string) => void;
  onNewSession: () => void;
  onDeleteSession: (sessionId: string) => void;
  onClearSession: () => void;
}

export function SessionSelector({
  sessions,
  currentSession,
  messagesCount,
  onSessionChange,
  onNewSession,
  onDeleteSession,
  onClearSession,
}: SessionSelectorProps) {
  return (
    <div className="flex items-center gap-2">
      <select
        className="bg-[var(--bg-surface)] border border-[var(--border-default)] text-[var(--text-secondary)] text-xs rounded-lg px-2 py-1.5 outline-none focus:border-blue-500 transition-colors"
        value={currentSession}
        onChange={(e) => onSessionChange(e.target.value)}
      >
        {sessions.map((s) => (
          <option key={s} value={s}>
            {s === 'default' ? 'Main Session' : `Chat (${s.slice(-6)})`}
          </option>
        ))}
      </select>

      {messagesCount > 0 && (
        <button
          onClick={onClearSession}
          className="bg-yellow-600/20 hover:bg-yellow-600/40 text-yellow-400 text-xs px-2 py-1.5 rounded-lg border border-yellow-900/50 transition-colors"
          title="Clear chat history"
        >
          🧹
        </button>
      )}

      {currentSession !== 'default' && (
        <button
          onClick={() => onDeleteSession(currentSession)}
          className="bg-red-600/20 hover:bg-red-600/40 text-red-400 text-xs px-2 py-1.5 rounded-lg border border-red-900/50 transition-colors"
          title="Delete current session"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}

      <button
        onClick={onNewSession}
        className="bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 text-xs px-3 py-1.5 rounded-lg border border-blue-900/50 transition-colors flex items-center gap-1"
      >
        <Plus className="w-3.5 h-3.5" />
        New
      </button>
    </div>
  );
}
