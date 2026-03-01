'use client';

import { useState, useCallback, useEffect } from 'react';
import { useCopilotStore } from '@/stores/copilotStore';
import { api } from '@/lib/api';
import { toast } from '@/components/ui/Toast';

export function useChatSession(projectId: string) {
  const store = useCopilotStore();
  const currentSession = store.getCurrentSession(projectId) || 'default';
  const sessions = store.getSessions(projectId);

  const setCurrentSession = useCallback((sessionId: string) => {
    store.setCurrentSession(projectId, sessionId);
  }, [projectId, store]);

  const fetchSessions = useCallback(async () => {
    try {
      const data = await api.get<{ sessions: string[] }>(`/ai/projects/${projectId}/chat/sessions`);
      store.setSessions(projectId, data.sessions);
    } catch (e) {
      console.error(e);
    }
  }, [projectId, store]);

  const handleNewSession = useCallback(() => {
    const newId = `chat-${Date.now()}`;
    store.setSessions(projectId, [newId, ...sessions]);
    setCurrentSession(newId);
    store.setMessages(projectId, newId, []);
  }, [projectId, sessions, store, setCurrentSession]);

  const handleDeleteSession = useCallback(async (sessionId: string) => {
    if (sessionId === 'default') {
      toast.error('Cannot delete the default session');
      return;
    }
    if (!confirm('Delete this chat session? The tasks will be preserved.')) return;

    try {
      await api.delete(`/ai/projects/${projectId}/chat/sessions/${sessionId}`);
      const newSessions = sessions.filter((s) => s !== sessionId);
      store.setSessions(projectId, newSessions);
      store.clearProject(projectId);
      if (currentSession === sessionId) {
        setCurrentSession('default');
      }
      toast.success('Session deleted');
      fetchSessions();
    } catch (e) {
      toast.error('Failed to delete session');
    }
  }, [projectId, sessions, currentSession, store, setCurrentSession, fetchSessions]);

  const handleClearSession = useCallback(async () => {
    if (!confirm('Clear all messages in this session? This cannot be undone.')) return;

    try {
      await api.delete(`/ai/projects/${projectId}/chat/sessions/${currentSession}/clear`);
      store.setMessages(projectId, currentSession, []);
      store.setHasMore(projectId, currentSession, false);
      store.setOldestTimestamp(projectId, currentSession, null);
      toast.success('Chat history cleared');
    } catch (e) {
      toast.error('Failed to clear history');
    }
  }, [projectId, currentSession, store]);

  return {
    currentSession,
    sessions,
    setCurrentSession,
    fetchSessions,
    handleNewSession,
    handleDeleteSession,
    handleClearSession,
  };
}
