'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useCopilotStore } from '@/stores/copilotStore';
import { api } from '@/lib/api';

export function useChatHistory(projectId: string, currentSession: string) {
  const store = useCopilotStore();
  const messages = store.getMessages(projectId, currentSession);
  const hasMore = store.getHasMore(projectId, currentSession);
  const isLoadingMore = store.getIsLoadingMore(projectId, currentSession);

  const fetchRecentMessages = useCallback(async () => {
    try {
      const data = await api.get<{ messages: any[]; has_more: boolean; oldest_created_at: string | null }>(
        `/ai/projects/${projectId}/chat/history?session_id=${currentSession}&limit=20`
      );
      store.setMessages(projectId, currentSession, data.messages);
      store.setHasMore(projectId, currentSession, data.has_more);
      store.setOldestTimestamp(projectId, currentSession, data.oldest_created_at);
    } catch (e) {
      console.error(e);
    }
  }, [projectId, currentSession, store]);

  const fetchOlderMessages = useCallback(async () => {
    if (isLoadingMore || !hasMore) return;

    const oldestTs = store.getOldestTimestamp(projectId, currentSession);
    if (!oldestTs) return;

    store.setIsLoadingMore(projectId, currentSession, true);

    try {
      const data = await api.get<{ messages: any[]; has_more: boolean; oldest_created_at: string | null }>(
        `/ai/projects/${projectId}/chat/history?session_id=${currentSession}&limit=20&before=${encodeURIComponent(oldestTs)}`
      );
      if (data.messages.length > 0) {
        store.prependMessages(projectId, currentSession, data.messages);
      }
      store.setHasMore(projectId, currentSession, data.has_more);
      store.setOldestTimestamp(projectId, currentSession, data.oldest_created_at);
    } catch (e) {
      console.error(e);
    } finally {
      store.setIsLoadingMore(projectId, currentSession, false);
    }
  }, [projectId, currentSession, hasMore, isLoadingMore, store]);

  const handleScroll = useCallback(async (e: React.UIEvent<HTMLDivElement>) => {
    const container = e.currentTarget;
    const isAtTop = container.scrollTop < 100;

    if (isAtTop && hasMore && !isLoadingMore) {
      const prevScrollHeight = container.scrollHeight;
      await fetchOlderMessages();
      requestAnimationFrame(() => {
        const newScrollHeight = container.scrollHeight;
        container.scrollTop = newScrollHeight - prevScrollHeight + container.scrollTop;
      });
    }
  }, [hasMore, isLoadingMore, fetchOlderMessages]);

  return {
    messages,
    hasMore,
    isLoadingMore,
    fetchRecentMessages,
    fetchOlderMessages,
    handleScroll,
  };
}
