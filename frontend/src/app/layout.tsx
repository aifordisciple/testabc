import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Autonome - AI Cloud Bio Platform",
  description: "Next Gen Agentic Bioinformatics",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      {/* 移除了 className 中的字体变量，直接使用 body */}
      <body className="antialiased bg-gray-950">
        {children}
      </body>
    </html>
  );
}