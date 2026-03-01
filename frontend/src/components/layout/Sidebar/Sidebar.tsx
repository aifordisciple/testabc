'use client';

import { type ReactNode, useState } from 'react';
import { 
  Folder, FlaskConical, Globe, Settings, LogOut, 
  ChevronLeft, ChevronRight, LayoutDashboard, ChevronDown,
  FileText, Database, Bot, HardDrive, Activity, Star, Clock, MessageSquare
} from 'lucide-react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/stores/authStore';
import { useProjectStore } from '@/stores/projectStore';
import { useLocale } from '@/stores/localeStore';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

interface NavItem {
  id: string;
  label: string;
  labelEn: string;
  icon: ReactNode;
  href?: string;
  onClick?: () => void;
  children?: NavItem[];
  badge?: number;
}

interface SidebarProps {
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  onWorkflowClick?: () => void;
  onKnowledgeClick?: () => void;
  onTasksClick?: () => void;
}

export function Sidebar({ 
  collapsed = false, 
  onToggleCollapse, 
  onWorkflowClick,
  onKnowledgeClick,
  onTasksClick
}: SidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { projects, currentProject } = useProjectStore();
  const { locale } = useLocale();
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    projects: true,
    quickAccess: true
  });

  const { data: allAnalyses = [] } = useQuery({
    queryKey: ['all-analyses-sidebar'],
    queryFn: async () => {
      return api.get<any[]>('/workflow/analyses?limit=50');
    },
    refetchInterval: 15000
  });

  const { data: storageData } = useQuery({
    queryKey: ['storage'],
    queryFn: async () => {
      return api.get<{ used: number; total: number }>('/files/storage');
    }
  });

  const runningTasks = allAnalyses.filter((a: any) => a.status === 'running' || a.status === 'pending').length;

  const displayName = user?.full_name || user?.email?.split('@')[0] || 'User';
  const email = user?.email || 'user@example.com';
  const initials = displayName.slice(0, 2).toUpperCase();

  const formatStorage = (bytes: number) => {
    if (!bytes) return '0 GB';
    const gb = bytes / (1024 * 1024 * 1024);
    if (gb >= 1) return `${gb.toFixed(1)} GB`;
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };

  const storagePercent = storageData ? (storageData.used / storageData.total) * 100 : 0;

  const mainNavItems: NavItem[] = [
    { 
      id: 'copilot', 
      label: 'AI 对话', 
      labelEn: 'Bio-Copilot', 
      icon: <MessageSquare className="w-[18px] h-[18px]" />, 
      href: '/copilot' 
    },
    { 
      id: 'dashboard', 
      label: '仪表盘', 
      labelEn: 'Dashboard', 
      icon: <LayoutDashboard className="w-[18px] h-[18px]" />, 
      href: '/dashboard' 
    },
    { 
      id: 'tasks', 
      label: '任务中心', 
      labelEn: 'Task Center', 
      icon: <Activity className="w-[18px] h-[18px]" />, 
      onClick: onTasksClick,
      badge: runningTasks > 0 ? runningTasks : undefined
    },
    { 
      id: 'workflows', 
      label: '工作流', 
      labelEn: 'Workflows', 
      icon: <FlaskConical className="w-[18px] h-[18px]" />, 
      onClick: onWorkflowClick
    },
    { 
      id: 'knowledge', 
      label: '公共数据', 
      labelEn: 'Knowledge', 
      icon: <Globe className="w-[18px] h-[18px]" />, 
      onClick: onKnowledgeClick
    },
  ];

  const quickAccessItems: NavItem[] = [
    {
      id: 'recent',
      label: '最近项目',
      labelEn: 'Recent',
      icon: <Clock className="w-[18px] h-[18px]" />
    },
    {
      id: 'starred',
      label: '收藏夹',
      labelEn: 'Starred',
      icon: <Star className="w-[18px] h-[18px]" />
    }
  ];

  const projectNavItems: NavItem[] = currentProject ? [
    {
      id: 'project-files',
      label: '文件',
      labelEn: 'Files',
      icon: <FileText className="w-[18px] h-[18px]" />,
      href: `/dashboard/project/${currentProject.id}?tab=files`
    },
    {
      id: 'project-data',
      label: '样本',
      labelEn: 'Samples',
      icon: <Database className="w-[18px] h-[18px]" />,
      href: `/dashboard/project/${currentProject.id}?tab=samples`
    },
    {
      id: 'project-copilot',
      label: 'AI 助手',
      labelEn: 'AI Copilot',
      icon: <Bot className="w-[18px] h-[18px]" />,
      href: `/dashboard/project/${currentProject.id}?tab=copilot`
    },
  ] : [];

  const handleLogout = () => {
    logout();
    router.push('/');
  };

  const getLabel = (item: NavItem) => locale === 'en' ? item.labelEn : item.label;

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const isActive = (item: NavItem) => {
    if (item.href) {
      return pathname === item.href || pathname.startsWith(item.href.split('?')[0]);
    }
    return false;
  };

  const NavLink = ({ item, showTooltip = false }: { item: NavItem; showTooltip?: boolean }) => {
    const active = isActive(item);
    const content = (
      <div
        className={cn(
          "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium",
          "transition-all duration-200 cursor-pointer",
          collapsed ? "justify-center" : "",
          active 
            ? "bg-primary/15 text-primary" 
            : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        )}
      >
        <span className="flex-shrink-0 relative">
          {item.icon}
          {item.badge && (
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-blue-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
              {item.badge > 9 ? '9+' : item.badge}
            </span>
          )}
        </span>
        {!collapsed && (
          <span className="truncate flex-1">{getLabel(item)}</span>
        )}
        {!collapsed && item.badge && (
          <span className="bg-blue-500/20 text-blue-400 text-xs px-1.5 py-0.5 rounded-full">
            {item.badge}
          </span>
        )}
      </div>
    );

    if (showTooltip && collapsed) {
      return (
        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>
            {item.onClick ? (
              <div onClick={item.onClick}>{content}</div>
            ) : item.href ? (
              <Link href={item.href}>{content}</Link>
            ) : (
              content
            )}
          </TooltipTrigger>
          <TooltipContent side="right" className="font-medium">
            {getLabel(item)}
            {item.badge && ` (${item.badge})`}
          </TooltipContent>
        </Tooltip>
      );
    }

    if (item.onClick) {
      return <div onClick={item.onClick}>{content}</div>;
    }
    if (item.href) {
      return <Link href={item.href}>{content}</Link>;
    }
    return content;
  };

  return (
    <div 
      className={cn(
        "flex flex-col h-full bg-sidebar border-r border-sidebar-border",
        "transition-all duration-300 ease-in-out relative",
        collapsed ? "w-16" : "w-[280px]"
      )}
    >
      <div className={cn(
        "p-4 border-b border-sidebar-border",
        "flex items-center gap-3 h-16",
        collapsed ? "justify-center" : ""
      )}>
        <Link href="/dashboard" className="flex items-center gap-3 group">
          <div className="
            w-9 h-9 rounded-lg flex items-center justify-center 
            bg-gradient-to-br from-primary to-blue-600
            shadow-md group-hover:shadow-lg group-hover:scale-105
            transition-all duration-200 flex-shrink-0
          ">
            <span className="text-white font-bold text-lg">A</span>
          </div>
          {!collapsed && (
            <div className="flex flex-col overflow-hidden">
              <span className="font-semibold text-sm text-foreground group-hover:text-primary transition-colors">
                Autonome
              </span>
              <span className="text-[11px] text-muted-foreground truncate">
                {locale === 'en' ? 'Bioinformatics AI' : '生物信息学 AI'}
              </span>
            </div>
          )}
        </Link>
      </div>

      {/* Storage Indicator */}
      {!collapsed && (
        <div className="px-4 py-3 border-b border-sidebar-border bg-gradient-to-r from-primary/5 to-transparent">
          <div className="flex items-center gap-2 mb-2">
            <HardDrive className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">
              {locale === 'zh' ? '存储空间' : 'Storage'}
            </span>
          </div>
          <div className="h-2 bg-sidebar-border rounded-full overflow-hidden">
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(storagePercent, 100)}%` }}
              className={cn(
                "h-full rounded-full transition-colors",
                storagePercent > 90 ? "bg-red-500" : storagePercent > 70 ? "bg-yellow-500" : "bg-primary"
              )}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-1.5">
            {formatStorage(storageData?.used || 0)} / {formatStorage(storageData?.total || 0)}
          </p>
        </div>
      )}

      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-4 px-3">
        <div className="space-y-1">
          {!collapsed && (
            <span className="px-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
              {locale === 'zh' ? '导航' : 'Navigation'}
            </span>
          )}
          {mainNavItems.map((item) => (
            <NavLink key={item.id} item={item} showTooltip />
          ))}
        </div>

        {/* Quick Access Section */}
        {!collapsed && (
          <div className="mt-6">
            <button
              onClick={() => toggleSection('quickAccess')}
              className="flex items-center justify-between w-full px-3 mb-2 hover:text-foreground transition-colors"
            >
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                {locale === 'zh' ? '快捷入口' : 'Quick Access'}
              </span>
              <motion.div
                animate={{ rotate: expandedSections.quickAccess ? 0 : -90 }}
                transition={{ duration: 0.2 }}
              >
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              </motion.div>
            </button>
            <AnimatePresence>
              {expandedSections.quickAccess && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-0.5 overflow-hidden"
                >
                  {quickAccessItems.map((item) => (
                    <NavLink key={item.id} item={item} showTooltip />
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {currentProject && (
          <div className="mt-6">
            {!collapsed && (
              <div className="flex items-center justify-between px-3 mb-2">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  {locale === 'en' ? 'Current Project' : '当前项目'}
                </span>
              </div>
            )}
            {!collapsed && (
              <div className="px-3 py-2 mb-2 rounded-lg bg-accent/50">
                <div className="flex items-center gap-2">
                  <Folder className="w-4 h-4 text-primary" />
                  <span className="text-sm font-medium truncate">{currentProject.name}</span>
                </div>
              </div>
            )}
            <div className="space-y-0.5">
              {projectNavItems.map((item) => (
                <NavLink key={item.id} item={item} showTooltip />
              ))}
            </div>
          </div>
        )}

        {projects.length > 0 && !collapsed && (
          <div className="mt-6">
            <button
              onClick={() => toggleSection('projects')}
              className="flex items-center justify-between w-full px-3 mb-2 hover:text-foreground transition-colors"
            >
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                {locale === 'en' ? 'All Projects' : '所有项目'}
              </span>
              <motion.div
                animate={{ rotate: expandedSections.projects ? 0 : -90 }}
                transition={{ duration: 0.2 }}
              >
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              </motion.div>
            </button>
            <AnimatePresence>
              {expandedSections.projects && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-0.5 overflow-hidden"
                >
                  {projects.slice(0, 5).map((project) => (
                    <Link
                      key={project.id}
                      href={`/dashboard/project/${project.id}`}
                      className={cn(
                        "flex items-center gap-2 px-3 py-2 rounded-lg text-sm",
                        "transition-all duration-200",
                        currentProject?.id === project.id
                          ? "bg-primary/15 text-primary"
                          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                      )}
                    >
                      <Folder className="w-4 h-4 flex-shrink-0" />
                      <span className="truncate">{project.name}</span>
                    </Link>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </nav>

      <div className="p-3 border-t border-sidebar-border">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className={cn(
                "flex items-center gap-3 w-full p-2 rounded-lg",
                "hover:bg-accent transition-colors",
                collapsed ? "justify-center" : ""
              )}
            >
              <Avatar className="w-8 h-8">
                <AvatarFallback className="bg-primary/20 text-primary text-xs font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              {!collapsed && (
                <div className="flex-1 text-left overflow-hidden">
                  <p className="text-sm font-medium truncate">{displayName}</p>
                  <p className="text-xs text-muted-foreground truncate">{email}</p>
                </div>
              )}
              {!collapsed && (
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align={collapsed ? "center" : "end"} side="top" className="w-56">
            <DropdownMenuItem asChild>
              <Link href="/settings" className="flex items-center gap-2">
                <Settings className="w-4 h-4" />
                <span>{locale === 'en' ? 'Settings' : '设置'}</span>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem 
              onClick={handleLogout}
              className="text-destructive focus:text-destructive"
            >
              <LogOut className="w-4 h-4 mr-2" />
              <span>{locale === 'en' ? 'Logout' : '退出登录'}</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Button
        variant="outline"
        size="icon-xs"
        onClick={onToggleCollapse}
        className={cn(
          "absolute top-1/2 -translate-y-1/2 -right-3",
          "w-6 h-6 rounded-full shadow-md",
          "bg-background border-border"
        )}
      >
        {collapsed ? (
          <ChevronRight className="w-3 h-3" />
        ) : (
          <ChevronLeft className="w-3 h-3" />
        )}
      </Button>
    </div>
  );
}
