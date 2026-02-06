import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Toaster } from 'react-hot-toast'; // 👈 1. 引入

const inter = Inter({ subsets: ['latin'] });

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
      <body className={inter.className}>
        {children}
        {/* 👇 2. 添加 Toaster 组件 */}
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