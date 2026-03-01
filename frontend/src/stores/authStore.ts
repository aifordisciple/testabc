'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { api, ApiError } from '@/lib/api';
import { getStorageItem, setStorageItem, removeStorageItem } from '@/lib/hooks';

interface User {
  id: string;
  email: string;
  full_name: string | null;
  created_at: string;
}

interface AuthState {
  token: string | null;
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  
  login: (email: string, password: string) => Promise<boolean>;
  register: (email: string, password: string, fullName?: string) => Promise<boolean>;
  logout: () => void;
  checkAuth: () => Promise<boolean>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,

      login: async (email: string, password: string) => {
        set({ isLoading: true, error: null });
        try {
          const response = await api.post<{ access_token: string; token_type: string }>(
            '/auth/login',
            { email, password }
          );
          
          const token = response.access_token;
          setStorageItem('token', token);
          
          const user = await api.get<User>('/auth/me');
          
          set({ 
            token, 
            user, 
            isAuthenticated: true, 
            isLoading: false,
            error: null 
          });
          
          return true;
        } catch (error) {
          const message = error instanceof ApiError ? error.detail : 'Login failed';
          set({ error: message, isLoading: false });
          return false;
        }
      },

      register: async (email: string, password: string, fullName?: string) => {
        set({ isLoading: true, error: null });
        try {
          await api.post('/auth/register', { 
            email, 
            password,
            full_name: fullName 
          });
          
          return get().login(email, password);
        } catch (error) {
          const message = error instanceof ApiError ? error.detail : 'Registration failed';
          set({ error: message, isLoading: false });
          return false;
        }
      },

      logout: () => {
        removeStorageItem('token');
        set({ 
          token: null, 
          user: null, 
          isAuthenticated: false,
          error: null 
        });
      },

      checkAuth: async () => {
        const token = getStorageItem<string>('token');
        if (!token) {
          set({ isAuthenticated: false, user: null });
          return false;
        }

        try {
          const user = await api.get<User>('/auth/me');
          set({ 
            token, 
            user, 
            isAuthenticated: true 
          });
          return true;
        } catch {
          removeStorageItem('token');
          set({ 
            token: null, 
            user: null, 
            isAuthenticated: false 
          });
          return false;
        }
      },

      clearError: () => set({ error: null }),
    }),
    {
      name: 'autonome-auth',
      partialize: (state) => ({ token: state.token }),
    }
  )
);

export function useAuth() {
  const state = useAuthStore();
  return state;
}
