import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "react-hot-toast";
import Providers from "./providers";

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
      <body className="bg-gray-950 text-white min-h-screen font-sans">
        <Providers>
          <Toaster position="top-right" toastOptions={{ className: 'text-sm font-medium bg-gray-900 text-white border border-gray-800' }} />
          {children}
        </Providers>
      </body>
    </html>
  );
}
