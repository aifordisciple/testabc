'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { toast } from '@/components/ui/Toast';

export interface Sample {
  id: string;
  name: string;
  project_id: string;
  description?: string;
  samplesheet_id?: string;
  status?: string;
  created_at: string;
}

export function useSamples(projectId: string) {
  return useQuery<Sample[]>({
    queryKey: ['samples', projectId],
    queryFn: () => api.get<Sample[]>(`/workflow/projects/${projectId}/samples`),
    enabled: !!projectId,
  });
}

export function useSample(projectId: string, sampleId: string) {
  return useQuery<Sample>({
    queryKey: ['sample', projectId, sampleId],
    queryFn: () => api.get<Sample>(`/workflow/projects/${projectId}/samples/${sampleId}`),
    enabled: !!projectId && !!sampleId,
  });
}

export function useCreateSample() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ projectId, data }: { projectId: string; data: { name: string; description?: string } }) =>
      api.post<Sample>(`/workflow/projects/${projectId}/samples`, data),
    onSuccess: (_, { projectId }) => {
      toast.success('Sample created');
      queryClient.invalidateQueries({ queryKey: ['samples', projectId] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create sample');
    },
  });
}

export function useDeleteSample() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ projectId, sampleId }: { projectId: string; sampleId: string }) =>
      api.delete(`/workflow/projects/${projectId}/samples/${sampleId}`),
    onSuccess: (_, { projectId }) => {
      toast.success('Sample deleted');
      queryClient.invalidateQueries({ queryKey: ['samples', projectId] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete sample');
    },
  });
}
