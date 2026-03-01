'use client';

import { create } from 'zustand';
import { api } from '@/lib/api';

interface Project {
  id: string;
  name: string;
  description: string;
  created_at: string;
}

interface ProjectState {
  projects: Project[];
  currentProject: Project | null;
  isLoading: boolean;
  error: string | null;
  
  fetchProjects: () => Promise<void>;
  setCurrentProject: (project: Project | null) => void;
  createProject: (data: { name: string; description?: string }) => Promise<Project>;
  deleteProject: (id: string) => Promise<void>;
  renameProject: (id: string, name: string) => Promise<void>;
}

export const useProjectStore = create<ProjectState>()((set, get) => ({
  projects: [],
  currentProject: null,
  isLoading: false,
  error: null,

  fetchProjects: async () => {
    set({ isLoading: true, error: null });
    try {
      const projects = await api.get<Project[]>('/files/projects');
      set({ projects, isLoading: false });
    } catch {
      set({ error: 'Failed to fetch projects', isLoading: false });
    }
  },

  setCurrentProject: (project) => {
    set({ currentProject: project });
  },

  createProject: async (data: { name: string; description?: string }) => {
    const project = await api.post<Project>('/files/projects', data);
    set((state) => ({
      projects: [project, ...state.projects],
      currentProject: project,
    }));
    return project;
  },

  deleteProject: async (id: string) => {
    await api.delete(`/files/projects/${id}`);
    set((state) => ({
      projects: state.projects.filter((p) => p.id !== id),
      currentProject: state.currentProject?.id === id ? null : state.currentProject,
    }));
  },

  renameProject: async (id: string, name: string) => {
    const updated = await api.patch<Project>(`/files/projects/${id}`, { name });
    set((state) => ({
      projects: state.projects.map((p) => (p.id === id ? { ...p, name } : p)),
      currentProject:
        state.currentProject?.id === id
          ? { ...state.currentProject, name }
          : state.currentProject,
    }));
  },
}));
