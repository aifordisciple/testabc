'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { toast } from '@/components/ui/Toast';

export interface FileItem {
  id: string;
  name: string;
  path: string;
  size: number;
  is_directory: boolean;
  project_id: string;
  created_at: string;
  updated_at?: string;
}

export interface FolderContents {
  files: FileItem[];
  folders: FileItem[];
}

export function useFiles(projectId: string, path: string = '/') {
  return useQuery<FolderContents>({
    queryKey: ['files', projectId, path],
    queryFn: () => api.get<FolderContents>(`/files/projects/${projectId}/files?path=${encodeURIComponent(path)}`),
    enabled: !!projectId,
  });
}

export function useFile(projectId: string, fileId: string) {
  return useQuery<FileItem>({
    queryKey: ['file', projectId, fileId],
    queryFn: () => api.get<FileItem>(`/files/projects/${projectId}/files/${fileId}`),
    enabled: !!projectId && !!fileId,
  });
}

export function useCreateFolder() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ projectId, path, name }: { projectId: string; path: string; name: string }) =>
      api.post<FileItem>(`/files/projects/${projectId}/folders`, { path, name }),
    onSuccess: (_, { projectId, path }) => {
      toast.success('Folder created');
      queryClient.invalidateQueries({ queryKey: ['files', projectId, path] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create folder');
    },
  });
}

export function useUploadFile() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ projectId, path, file }: { projectId: string; path: string; file: File }) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('path', path);
      return api.upload<FileItem>(`/files/projects/${projectId}/upload`, formData);
    },
    onSuccess: (_, { projectId, path }) => {
      toast.success('File uploaded');
      queryClient.invalidateQueries({ queryKey: ['files', projectId, path] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to upload file');
    },
  });
}

export function useDeleteFile() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ projectId, fileId, path }: { projectId: string; fileId: string; path: string }) =>
      api.delete(`/files/projects/${projectId}/files/${fileId}`),
    onSuccess: (_, { projectId, path }) => {
      toast.success('File deleted');
      queryClient.invalidateQueries({ queryKey: ['files', projectId, path] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete file');
    },
  });
}

export function useRenameFile() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ projectId, fileId, name, path }: { projectId: string; fileId: string; name: string; path: string }) =>
      api.patch<FileItem>(`/files/projects/${projectId}/files/${fileId}`, { name }),
    onSuccess: (_, { projectId, path }) => {
      toast.success('File renamed');
      queryClient.invalidateQueries({ queryKey: ['files', projectId, path] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to rename file');
    },
  });
}
