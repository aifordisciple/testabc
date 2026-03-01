'use client';

import { useState, useCallback } from 'react';
import { useCopilotStore } from '@/stores/copilotStore';
import { toast } from '@/components/ui/Toast';
import { api } from '@/lib/api';

export function useChatStream(projectId: string, currentSession: string) {
  const [isLoading, setIsLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [streamingPlan, setStreamingPlan] = useState<string | null>(null);
  const store = useCopilotStore();

  const handleSendStream = useCallback(async (userMsg: string) => {
    if (!userMsg.trim() || isLoading) return;

    store.appendMessage(projectId, currentSession, { role: 'user', content: userMsg });
    setIsLoading(true);
    setStreamingContent('');
    setStreamingPlan(null);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/ai/projects/${projectId}/chat/stream`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ message: userMsg, session_id: currentSession }),
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      const decoder = new TextDecoder();
      let accumulatedContent = '';
      let accumulatedPlan: string | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value, { stream: true });
        const lines = text.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));

              switch (data.type) {
                case 'token':
                  accumulatedContent += data.content;
                  setStreamingContent(accumulatedContent);
                  break;

                case 'plan':
                  accumulatedPlan = data.plan_data;
                  setStreamingPlan(accumulatedPlan);
                  break;

                case 'done':
                  store.appendMessage(projectId, currentSession, {
                    role: 'assistant',
                    content: accumulatedContent || 'I have created an analysis plan for you.',
                    plan_data: accumulatedPlan,
                  });
                  setStreamingContent('');
                  setStreamingPlan(null);
                  break;

                case 'error':
                  toast.error(data.message);
                  store.appendMessage(projectId, currentSession, {
                    role: 'assistant',
                    content: `**Error**: ${data.message}`,
                  });
                  setStreamingContent('');
                  setStreamingPlan(null);
                  break;
              }
            } catch (parseError) {
              console.error('Failed to parse SSE data:', parseError);
            }
          }
        }
      }
    } catch (error) {
      console.error('Stream error:', error);
      store.appendMessage(projectId, currentSession, {
        role: 'assistant',
        content: '**Error**: Connection failed. Please try again.',
      });
      setStreamingContent('');
      setStreamingPlan(null);
    } finally {
      setIsLoading(false);
    }
  }, [projectId, currentSession, isLoading, store]);

  return {
    isLoading,
    streamingContent,
    streamingPlan,
    handleSendStream,
  };
}
