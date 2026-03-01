'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type Theme = 'light' | 'dark' | 'system';

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  resolvedTheme: 'light' | 'dark';
}

const getSystemTheme = (): 'light' | 'dark' => {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

const resolveTheme = (theme: Theme): 'light' | 'dark' => {
  if (theme === 'system') {
    return getSystemTheme();
  }
  return theme;
};

const applyTheme = (resolved: 'light' | 'dark') => {
  if (typeof document !== 'undefined') {
    const root = document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(resolved);
    root.setAttribute('data-theme', resolved);
    
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      metaThemeColor.setAttribute('content', resolved === 'dark' ? '#030712' : '#f8fafc');
    }
  }
};

let mediaQueryHandler: ((e: MediaQueryListEvent) => void) | null = null;

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: 'system',
      resolvedTheme: 'dark',
      
      setTheme: (theme) => {
        const resolved = resolveTheme(theme);
        set({ theme, resolvedTheme: resolved });
        applyTheme(resolved);
        
        if (typeof window !== 'undefined') {
          if (mediaQueryHandler) {
            window.matchMedia('(prefers-color-scheme: dark)').removeEventListener('change', mediaQueryHandler);
          }
          
          if (theme === 'system') {
            mediaQueryHandler = () => {
              const newResolved = getSystemTheme();
              set({ resolvedTheme: newResolved });
              applyTheme(newResolved);
            };
            window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', mediaQueryHandler);
          }
        }
      },

      toggleTheme: () => {
        const { resolvedTheme } = get();
        const newTheme = resolvedTheme === 'dark' ? 'light' : 'dark';
        get().setTheme(newTheme);
      },
    }),
    {
      name: 'autonome-theme',
      onRehydrateStorage: () => (state) => {
        if (state && typeof window !== 'undefined') {
          const resolved = resolveTheme(state.theme);
          state.resolvedTheme = resolved;
          applyTheme(resolved);
          
          if (state.theme === 'system') {
            mediaQueryHandler = () => {
              const newResolved = getSystemTheme();
              const currentState = useThemeStore.getState();
              if (currentState.theme === 'system') {
                useThemeStore.setState({ resolvedTheme: newResolved });
                applyTheme(newResolved);
              }
            };
            window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', mediaQueryHandler);
          }
        }
      },
    }
  )
);

export function useTheme() {
  const { theme, setTheme, resolvedTheme, toggleTheme } = useThemeStore();
  return { theme, setTheme, resolvedTheme, toggleTheme };
}

export function initTheme() {
  const state = useThemeStore.getState();
  const resolved = resolveTheme(state.theme);
  applyTheme(resolved);
}
