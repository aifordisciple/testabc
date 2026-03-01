'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { useState, useEffect } from 'react';
import { Toaster } from 'sonner';
import { useThemeStore } from '@/stores/themeStore';

export default function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            refetchOnWindowFocus: true,
            retry: 1,
          },
        },
      })
  );

  const resolvedTheme = useThemeStore((state) => state.resolvedTheme);

  useEffect(() => {
    useThemeStore.getState().setTheme(useThemeStore.getState().theme);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <Toaster 
        position="bottom-right"
        theme={resolvedTheme === 'light' ? 'light' : 'dark'}
        richColors
        closeButton
        expand={true}
        toastOptions={{
          classNames: {
            toast: 'bg-card border-border',
            title: 'text-foreground',
            description: 'text-muted-foreground',
            actionButton: 'bg-primary text-primary-foreground',
            cancelButton: 'bg-muted text-muted-foreground',
            closeButton: 'bg-muted border-border',
          },
        }}
      />
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
