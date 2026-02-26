import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  plan_data?: string | null;
  attachments?: string | null;
  created_at?: string;
}

interface CopilotState {
  messagesCache: Record<string, ChatMessage[]>;
  sessionsCache: Record<string, string[]>;
  currentSessionCache: Record<string, string>;
  isLoadingMore: Record<string, boolean>;
  hasMore: Record<string, boolean>;
  oldestTimestamps: Record<string, string | null>;
  pendingTaskCounts: Record<string, number>;
  
  getMessages: (projectId: string, sessionId: string) => ChatMessage[];
  setMessages: (projectId: string, sessionId: string, messages: ChatMessage[]) => void;
  prependMessages: (projectId: string, sessionId: string, messages: ChatMessage[]) => void;
  appendMessage: (projectId: string, sessionId: string, message: ChatMessage) => void;
  
  getSessions: (projectId: string) => string[];
  setSessions: (projectId: string, sessions: string[]) => void;
  
  getCurrentSession: (projectId: string) => string;
  setCurrentSession: (projectId: string, sessionId: string) => void;
  
  getIsLoadingMore: (projectId: string, sessionId: string) => boolean;
  setIsLoadingMore: (projectId: string, sessionId: string, loading: boolean) => void;
  
  getHasMore: (projectId: string, sessionId: string) => boolean;
  setHasMore: (projectId: string, sessionId: string, hasMore: boolean) => void;
  
  getOldestTimestamp: (projectId: string, sessionId: string) => string | null;
  setOldestTimestamp: (projectId: string, sessionId: string, timestamp: string | null) => void;
  
  getPendingTaskCount: (projectId: string) => number;
  setPendingTaskCount: (projectId: string, count: number) => void;
  
  clearProject: (projectId: string) => void;
}

const getKey = (projectId: string, sessionId: string) => `${projectId}:${sessionId}`;

export const useCopilotStore = create<CopilotState>()(
  persist(
    (set, get) => ({
      messagesCache: {},
      sessionsCache: {},
      currentSessionCache: {},
      isLoadingMore: {},
      hasMore: {},
      oldestTimestamps: {},
      pendingTaskCounts: {},
      
      getMessages: (projectId, sessionId) => {
        const key = getKey(projectId, sessionId);
        return get().messagesCache[key] || [];
      },
      
      setMessages: (projectId, sessionId, messages) => {
        const key = getKey(projectId, sessionId);
        set(state => ({
          messagesCache: { ...state.messagesCache, [key]: messages }
        }));
      },
      
      prependMessages: (projectId, sessionId, messages) => {
        const key = getKey(projectId, sessionId);
        set(state => {
          const existing = state.messagesCache[key] || [];
          return {
            messagesCache: { ...state.messagesCache, [key]: [...messages, ...existing] }
          };
        });
      },
      
      appendMessage: (projectId, sessionId, message) => {
        const key = getKey(projectId, sessionId);
        set(state => {
          const existing = state.messagesCache[key] || [];
          return {
            messagesCache: { ...state.messagesCache, [key]: [...existing, message] }
          };
        });
      },
      
      getSessions: (projectId) => {
        return get().sessionsCache[projectId] || ['default'];
      },
      
      setSessions: (projectId, sessions) => {
        set(state => ({
          sessionsCache: { ...state.sessionsCache, [projectId]: sessions }
        }));
      },
      
      getCurrentSession: (projectId) => {
        return get().currentSessionCache[projectId] || 'default';
      },
      
      setCurrentSession: (projectId, sessionId) => {
        set(state => ({
          currentSessionCache: { ...state.currentSessionCache, [projectId]: sessionId }
        }));
      },
      
      getIsLoadingMore: (projectId, sessionId) => {
        const key = getKey(projectId, sessionId);
        return get().isLoadingMore[key] || false;
      },
      
      setIsLoadingMore: (projectId, sessionId, loading) => {
        const key = getKey(projectId, sessionId);
        set(state => ({
          isLoadingMore: { ...state.isLoadingMore, [key]: loading }
        }));
      },
      
      getHasMore: (projectId, sessionId) => {
        const key = getKey(projectId, sessionId);
        return get().hasMore[key] !== false;
      },
      
      setHasMore: (projectId, sessionId, hasMore) => {
        const key = getKey(projectId, sessionId);
        set(state => ({
          hasMore: { ...state.hasMore, [key]: hasMore }
        }));
      },
      
      getOldestTimestamp: (projectId, sessionId) => {
        const key = getKey(projectId, sessionId);
        return get().oldestTimestamps[key] || null;
      },
      
      setOldestTimestamp: (projectId, sessionId, timestamp) => {
        const key = getKey(projectId, sessionId);
        set(state => ({
          oldestTimestamps: { ...state.oldestTimestamps, [key]: timestamp }
        }));
      },
      
      getPendingTaskCount: (projectId) => {
        return get().pendingTaskCounts[projectId] || 0;
      },
      
      setPendingTaskCount: (projectId, count) => {
        set(state => ({
          pendingTaskCounts: { ...state.pendingTaskCounts, [projectId]: count }
        }));
      },
      
      clearProject: (projectId) => {
        set(state => {
          const newCache = { ...state.messagesCache };
          const newSessions = { ...state.sessionsCache };
          const newCurrent = { ...state.currentSessionCache };
          const newLoading = { ...state.isLoadingMore };
          const newHasMore = { ...state.hasMore };
          const newTimestamps = { ...state.oldestTimestamps };
          
          Object.keys(newCache).forEach(key => {
            if (key.startsWith(projectId + ':')) {
              delete newCache[key];
              delete newLoading[key];
              delete newHasMore[key];
              delete newTimestamps[key];
            }
          });
          
          delete newSessions[projectId];
          delete newCurrent[projectId];
          
          return {
            messagesCache: newCache,
            sessionsCache: newSessions,
            currentSessionCache: newCurrent,
            isLoadingMore: newLoading,
            hasMore: newHasMore,
            oldestTimestamps: newTimestamps
          };
        });
      }
    }),
    {
      name: 'copilot-storage',
      partialize: (state) => ({
        messagesCache: state.messagesCache,
        sessionsCache: state.sessionsCache,
        currentSessionCache: state.currentSessionCache
      })
    }
  )
);
