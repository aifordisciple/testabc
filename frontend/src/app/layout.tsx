import type { Metadata } from 'next';
import './globals.css';
import { Toaster } from 'react-hot-toast';

export const metadata: Metadata = {
  title: 'Autonome',
  description: 'Bioinformatics Analysis Platform',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      {/* ⚠️ 移除 inter.className，改用 Tailwind 类名设置默认背景 */}
      <body className="antialiased bg-gray-950 text-white">
        {children}
        
        <Toaster 
          position="top-center"
          toastOptions={{
            style: {
              background: '#1f2937', // bg-gray-800
              color: '#fff',
              border: '1px solid #374151', // border-gray-700
            },
            success: {
              iconTheme: {
                primary: '#10b981', // emerald-500
                secondary: '#fff',
              },
            },
            error: {
              iconTheme: {
                primary: '#ef4444', // red-500
                secondary: '#fff',
              },
            }
          }}
        />
      </body>
    </html>
  );
}