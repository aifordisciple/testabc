import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";
import Providers from "./providers";

const geist = GeistSans;

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
    <html lang="en" className="dark">
      <body className={`${geist.variable} font-sans antialiased`}>
        <TooltipProvider>
          <Providers>
            {children}
          </Providers>
        </TooltipProvider>
      </body>
    </html>
  );
}
