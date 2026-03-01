'use client';

import { type ReactNode, useState } from 'react';
import { Sidebar } from './Sidebar/Sidebar';
import { MobileDrawer } from './Sidebar/MobileDrawer';
import { Header, type BreadcrumbItem } from './Header';
import { cn } from '@/lib/utils';

interface AppLayoutProps {
  children: ReactNode;
  sidebarContent?: ReactNode;
  title?: string;
  breadcrumbs?: BreadcrumbItem[];
  onWorkflowClick?: () => void;
  onKnowledgeClick?: () => void;
  onTasksClick?: () => void;
}

export function AppLayout({ 
  children, 
  sidebarContent,
  title, 
  breadcrumbs,
  onWorkflowClick,
  onKnowledgeClick,
  onTasksClick
}: AppLayoutProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      {mobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/60 z-40 md:hidden backdrop-blur-sm"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Desktop sidebar - visible on lg+ (1024px+) */}
      <div className="hidden lg:flex lg:flex-shrink-0 relative">
        <Sidebar 
          collapsed={sidebarCollapsed} 
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
          onWorkflowClick={onWorkflowClick}
          onKnowledgeClick={onKnowledgeClick}
          onTasksClick={onTasksClick}
        />
        {sidebarContent}
      </div>

      {/* Tablet sidebar - visible on md to lg (768px - 1024px) - collapsed by default */}
      <div className="hidden md:flex lg:hidden flex-shrink-0 relative">
        <Sidebar 
          collapsed={true}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
          onWorkflowClick={onWorkflowClick}
          onKnowledgeClick={onKnowledgeClick}
          onTasksClick={onTasksClick}
        />
        {sidebarContent}
      </div>

      {/* Mobile drawer - visible below md (<768px) */}
      <MobileDrawer 
        isOpen={mobileMenuOpen} 
        onClose={() => setMobileMenuOpen(false)} 
        onWorkflowClick={onWorkflowClick}
        onKnowledgeClick={onKnowledgeClick}
        onTasksClick={onTasksClick}
      />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header 
          title={title}
          breadcrumbs={breadcrumbs}
          onMenuClick={() => setMobileMenuOpen(true)}
        />

        <main className="flex-1 overflow-hidden">
          <div className="h-full p-3 md:p-4 lg:p-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
