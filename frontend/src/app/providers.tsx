'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { useState } from 'react';

export default function Providers({ children }: { children: React.ReactNode }) {
  // 使用 useState 确保每个请求/会话(特别是SSR时)都有自己独立的 QueryClient
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000, // 数据 1 分钟内被认为是新鲜的，不会频繁在后台重新拉取
            refetchOnWindowFocus: true, // 切换浏览器 Tab 回来时自动刷新
            retry: 1, // 失败后重试 1 次
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}