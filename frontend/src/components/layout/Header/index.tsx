'use client';

import { Menu, Activity, Play, Bell } from 'lucide-react';
import { GlobalSearch } from './GlobalSearch';
import { Breadcrumb, type BreadcrumbItem } from './Breadcrumb';
import { NotificationBell } from './NotificationBell';
import { UserMenu } from './UserMenu';
import { ThemeToggleCompact } from '@/components/ui/ThemeToggle';
import { LanguageSwitch } from '@/components/ui/LanguageSwitch';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useLocale } from '@/stores/localeStore';

interface HeaderProps {
  title?: string;
  breadcrumbs?: BreadcrumbItem[];
  onMenuClick?: () => void;
  showMobileMenuButton?: boolean;
  onRunTask?: () => void;
}

export function Header({ 
  title, 
  breadcrumbs = [], 
  onMenuClick,
  showMobileMenuButton = true,
  onRunTask
}: HeaderProps) {
  const { locale } = useLocale();
  const { data: analyses = [] } = useQuery({
    queryKey: ['header-analyses'],
    queryFn: async () => {
      return api.get<any[]>('/workflow/analyses?limit=50');
    },
    refetchInterval: 15000
  });

  const runningTasks = analyses.filter((a: any) => a.status === 'running' || a.status === 'pending').length;

  return (
    <header 
      className={cn(
        "h-14 flex-shrink-0 flex items-center justify-between",
        "px-3 md:px-4 lg:px-6 gap-2 md:gap-4",
        "border-b border-border",
        "bg-background/80 backdrop-blur-sm",
        "sticky top-0 z-30"
      )}
    >
      <div className="flex items-center gap-2 md:gap-4 min-w-0">
        {showMobileMenuButton && (
          <button
            onClick={onMenuClick}
            className={cn(
              "md:hidden lg:hidden p-2 rounded-lg",
              "hover:bg-accent",
              "text-muted-foreground hover:text-foreground",
              "transition-colors flex-shrink-0",
              "touch-target-min flex items-center justify-center"
            )}
          >
            <Menu className="w-5 h-5" />
          </button>
        )}
        
        {breadcrumbs.length > 0 ? (
          <Breadcrumb items={breadcrumbs} />
        ) : title ? (
          <h1 className="text-sm md:text-base font-semibold text-foreground truncate">
            {title}
          </h1>
        ) : null}
      </div>

      <div className="flex items-center gap-1 md:gap-2 lg:gap-3 flex-shrink-0">
        <div className="hidden md:block lg:hidden">
          <GlobalSearch className="w-48 lg:w-64 xl:w-80" />
        </div>
        <div className="hidden lg:block">
          <GlobalSearch className="w-64 xl:w-80" />
        </div>
        
        {onRunTask && (
          <Button 
            size="sm" 
            className="flex gap-1.5 md:gap-2 text-xs md:text-sm"
            onClick={onRunTask}
          >
            <Play className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{locale === 'zh' ? '运行任务' : 'Run Task'}</span>
          </Button>
        )}
        
        {runningTasks > 0 && (
          <div className={cn(
            "flex items-center gap-1.5 px-2 py-1 rounded-full",
            "bg-blue-500/15 text-blue-400 text-xs font-medium animate-pulse",
            runningTasks > 0 ? "animate-pulse" : ""
          )}>
            <Activity className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{runningTasks}</span>
          </div>
        )}
        
        <NotificationBell />
        
        <LanguageSwitch compact />
        
        <ThemeToggleCompact />
        
        <UserMenu />
      </div>
    </header>
  );
}

export { type BreadcrumbItem } from './Breadcrumb';
