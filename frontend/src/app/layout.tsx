import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "react-hot-toast";
import Providers from "./providers"; // 👈 引入 Providers

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Autonome - Bioinformatics AI Agent",
  description: "AI-driven bioinformatics platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-gray-950 text-white min-h-screen`}>
        <Providers> {/* 👈 用 Providers 包裹 */}
          <Toaster position="top-right" toastOptions={{ className: 'text-sm font-medium bg-gray-900 text-white border border-gray-800' }} />
          {children}
        </Providers>
      </body>
    </html>
  );
}