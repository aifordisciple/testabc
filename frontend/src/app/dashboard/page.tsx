'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import CreateProjectModal from '@/components/CreateProjectModal';
import ProjectWorkspace from '@/components/ProjectWorkspace';
import WorkflowManager from '@/components/WorkflowManager';
import KnowledgeBase from '@/components/KnowledgeBase';
import TaskBoard from '@/components/TaskBoard';
import { AppLayout } from '@/components/layout/AppLayout';
import { toast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatsCard, StatsGrid } from '@/components/ui/stats-card';
import { AnimatedTabsUnderline } from '@/components/ui/animated-tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/Card';
import { 
  Pencil, Trash2, Plus, Search, FolderOpen, X, FlaskConical, Globe, Bot,
  Play, Upload, Activity, Clock, HardDrive, TrendingUp, ArrowRight, Star, Zap, Grid3X3
} from 'lucide-react';
import { useLocale } from '@/stores/localeStore';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface Project { 
  id: string; 
  name: string; 
  description: string; 
  created_at: string;
  updated_at?: string;
}

interface Analysis {
  id: string;
  workflow: string;
  status: string;
  start_time: string;
  end_time?: string;
}

interface StorageInfo {
  used: number;
  total: number;
}

interface Tab { 
  key: string; 
  label: string; 
  type: 'dashboard' | 'projects' | 'project' | 'workflow' | 'knowledge' | 'tasks'; 
  data?: { projectId?: string }; 
  icon?: React.ReactNode;
}

const translations = {
  zh: {
    title: '工作台',
    subtitle: '欢迎回来，这里是您的生信分析指挥中心',
    newProject: '新建项目',
    searchPlaceholder: '搜索项目...',
    loading: '加载中...',
    noDescription: '暂无描述',
    open: '打开',
    confirmDelete: '确定要删除此项目吗？',
    projectDeleted: '项目已删除',
    projectCreated: '项目创建成功',
    renamed: '重命名成功',
    workflowManager: '工作流管理',
    publicData: '公共数据',
    dashboard: '仪表盘',
    allProjects: '全部项目',
    noProjects: '暂无项目',
    createFirst: '创建第一个项目',
    totalProjects: '项目总数',
    activeTasks: '运行中任务',
    storageUsed: '已用存储',
    recentActivity: '最近活动',
    quickAccess: '快速访问',
    tasks: '任务中心',
    viewAll: '查看全部',
    recentProjects: '最近项目',
    noRecentActivity: '暂无最近活动',
    runningTasks: '运行中',
    completedTasks: '已完成',
    failedTasks: '失败',
    queuedTasks: '排队中',
  },
  en: {
    title: 'Workspace',
    subtitle: 'Welcome back, your bioinformatics command center',
    newProject: 'New Project',
    searchPlaceholder: 'Search projects...',
    loading: 'Loading...',
    noDescription: 'No description',
    open: 'Open',
    confirmDelete: 'Are you sure you want to delete this project?',
    projectDeleted: 'Project deleted',
    projectCreated: 'Project created successfully',
    renamed: 'Renamed successfully',
    workflowManager: 'Workflow Manager',
    publicData: 'Public Data',
    dashboard: 'Dashboard',
    allProjects: 'All Projects',
    noProjects: 'No projects yet',
    createFirst: 'Create your first project',
    totalProjects: 'Total Projects',
    activeTasks: 'Active Tasks',
    storageUsed: 'Storage Used',
    recentActivity: 'Recent Activity',
    quickAccess: 'Quick Access',
    tasks: 'Task Center',
    viewAll: 'View All',
    recentProjects: 'Recent Projects',
    noRecentActivity: 'No recent activity',
    runningTasks: 'Running',
    completedTasks: 'Completed',
    failedTasks: 'Failed',
    queuedTasks: 'Queued',
  }
};

export default function Dashboard() {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const { locale } = useLocale();
  const t = translations[locale];
  
  const initialTab = searchParams.get('tab') || 'dashboard';
  
  const getInitialTabs = (): Tab[] => {
    const baseTabs: Tab[] = [{ 
      key: 'dashboard', 
      label: t.dashboard, 
      type: 'dashboard',
      icon: <FolderOpen className="w-4 h-4" />
    }];
    if (initialTab === 'workflows') {
      baseTabs.push({ 
        key: 'admin-workflows', 
        label: t.workflowManager, 
        type: 'workflow',
        icon: <FlaskConical className="w-4 h-4" />
      });
    } else if (initialTab === 'knowledge') {
      baseTabs.push({ 
        key: 'knowledge-base', 
        label: t.publicData, 
        type: 'knowledge',
        icon: <Globe className="w-4 h-4" />
      });
    } else if (initialTab === 'tasks') {
      baseTabs.push({ 
        key: 'task-center', 
        label: t.tasks, 
        type: 'tasks',
        icon: <Activity className="w-4 h-4" />
      });
    }
    return baseTabs;
  };
  
  const getInitialActiveKey = (): string => {
    if (initialTab === 'workflows') return 'admin-workflows';
    if (initialTab === 'knowledge') return 'knowledge-base';
    if (initialTab === 'tasks') return 'task-center';
    return 'dashboard';
  };
  
  const [tabs, setTabs] = useState<Tab[]>(getInitialTabs);
  const [activeTabKey, setActiveTabKey] = useState(getInitialActiveKey);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [showCreate, setShowCreate] = useState(false);
  const [isRenaming, setIsRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const { data: projects = [], isLoading: projectsLoading } = useQuery<Project[]>({
    queryKey: ['projects'],
    queryFn: async () => {
      return api.get<Project[]>('/files/projects');
    }
  });

  const { data: allAnalyses = [] } = useQuery<Analysis[]>({
    queryKey: ['all-analyses'],
    queryFn: async () => {
      return api.get<Analysis[]>('/workflow/analyses?limit=50');
    },
    refetchInterval: 10000
  });

  const { data: storageData } = useQuery<StorageInfo>({
    queryKey: ['storage'],
    queryFn: async () => {
      return api.get<StorageInfo>('/files/storage');
    }
  });

  const runningTasks = allAnalyses.filter(a => a.status === 'running' || a.status === 'pending').length;
  const completedTasks = allAnalyses.filter(a => a.status === 'completed').length;
  const failedTasks = allAnalyses.filter(a => a.status === 'failed').length;

  const formatStorage = (bytes: number) => {
    if (!bytes) return '0 GB';
    const gb = bytes / (1024 * 1024 * 1024);
    if (gb >= 1) return `${gb.toFixed(1)} GB`;
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };

  const deleteProjectMutation = useMutation({
    mutationFn: async (id: string) => {
      return api.delete(`/files/projects/${id}`);
    },
    onSuccess: (_, id) => {
      toast.success(t.projectDeleted);
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      closeTab(`project-${id}`);
    }
  });

  const renameProjectMutation = useMutation({
    mutationFn: async ({ id, name }: { id: string, name: string }) => {
      return api.patch<Project>(`/files/projects/${id}`, { name });
    },
    onSuccess: (_, { id, name }) => {
      toast.success(t.renamed);
      setIsRenaming(null);
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setTabs(prev => prev.map(tab => 
        tab.key === `project-${id}` ? { ...tab, label: name } : tab
      ));
    }
  });

  const openProjectTab = (project: Project) => {
    const key = `project-${project.id}`;
    if (!tabs.find(t => t.key === key)) {
      setTabs([...tabs, { 
        key, 
        label: project.name, 
        type: 'project', 
        data: { projectId: project.id },
        icon: <Bot className="w-4 h-4" />
      }]);
    }
    setActiveTabKey(key);
  };

  const openAllProjectsTab = () => {
    const key = 'all-projects';
    if (!tabs.find(t => t.key === key)) {
      setTabs([...tabs, { 
        key, 
        label: t.allProjects, 
        type: 'projects',
        icon: <Grid3X3 className="w-4 h-4" />
      }]);
    }
    setActiveTabKey(key);
  };

  const closeTab = (key: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (key === 'dashboard' || key === 'all-projects') return;
    const newTabs = tabs.filter(t => t.key !== key);
    setTabs(newTabs);
    if (activeTabKey === key) {
      setActiveTabKey(newTabs[newTabs.length - 1].key);
    }
  };

  const handleCreateSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ['projects'] });
    toast.success(t.projectCreated);
  };

  const filteredProjects = projects.filter(p => 
    p.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const recentProjects = [...projects]
    .sort((a, b) => new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime())
    .slice(0, 4);

  const getBreadcrumbs = () => {
    if (activeTabKey === 'dashboard' || activeTabKey === 'all-projects') {
      return [{ label: t.title }];
    }
    const activeTab = tabs.find(t => t.key === activeTabKey);
    if (activeTab) {
      return [
        { label: t.title, href: '/dashboard' },
        { label: activeTab.label }
      ];
    }
    return [];
  };

  const QuickActionButton = ({ icon: Icon, label, onClick, color = 'blue' }: { icon: any, label: string, onClick: () => void, color?: 'blue' | 'emerald' | 'purple' | 'orange' }) => {
    const colorClasses = {
      blue: 'from-blue-600/20 to-blue-600/5 border-blue-500/30 hover:border-blue-500/60 hover:from-blue-600/30 hover:to-blue-600/10 text-blue-400',
      emerald: 'from-emerald-600/20 to-emerald-600/5 border-emerald-500/30 hover:border-emerald-500/60 hover:from-emerald-600/30 hover:to-emerald-600/10 text-emerald-400',
      purple: 'from-purple-600/20 to-purple-600/5 border-purple-500/30 hover:border-purple-500/60 hover:from-purple-600/30 hover:to-purple-600/10 text-purple-400',
      orange: 'from-orange-600/20 to-orange-600/5 border-orange-500/30 hover:border-orange-500/60 hover:from-orange-600/30 hover:to-orange-600/10 text-orange-400',
    };
    
    return (
      <motion.button
        whileHover={{ scale: 1.02, y: -2 }}
        whileTap={{ scale: 0.98 }}
        onClick={onClick}
        className={cn(
          "flex items-center gap-3 p-4 rounded-xl border transition-all text-left",
          "bg-gradient-to-br shadow-lg shadow-black/5",
          colorClasses[color]
        )}
      >
        <div className="p-2.5 rounded-lg bg-white/10">
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <p className="font-semibold text-sm">{label}</p>
        </div>
      </motion.button>
    );
  };

  const ProjectCard = ({ project, showActions = true }: { project: Project, showActions?: boolean }) => (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      whileHover={{ y: -4 }}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
      onClick={() => openProjectTab(project)}
      className={cn(
        "group bg-card rounded-xl p-5 cursor-pointer",
        "border border-border hover:border-primary/50",
        "shadow-sm hover:shadow-lg hover:shadow-primary/5",
        "transition-all duration-200"
      )}
    >
      <div className="flex justify-between items-start mb-3">
        <div className="p-2.5 rounded-lg bg-primary/10">
          <FolderOpen className="w-5 h-5 text-primary" />
        </div>
        {showActions && (
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={(e) => { 
                e.stopPropagation(); 
                setIsRenaming(project.id); 
                setRenameValue(project.name); 
              }}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              aria-label={locale === 'zh' ? '重命名项目' : 'Rename project'}
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={(e) => { 
                e.stopPropagation(); 
                if (confirm(t.confirmDelete)) deleteProjectMutation.mutate(project.id); 
              }}
              className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
              aria-label={locale === 'zh' ? '删除项目' : 'Delete project'}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
      
      {isRenaming === project.id ? (
        <Input
          autoFocus
          className="font-semibold text-base h-auto py-1"
          value={renameValue}
          onChange={e => setRenameValue(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') renameProjectMutation.mutate({ id: project.id, name: renameValue });
            if (e.key === 'Escape') setIsRenaming(null);
          }}
          onBlur={() => setIsRenaming(null)}
          onClick={e => e.stopPropagation()}
        />
      ) : (
        <h3 className="text-base font-semibold mb-1 text-foreground group-hover:text-primary transition-colors">
          {project.name}
        </h3>
      )}
      
      <p className="text-muted-foreground text-sm line-clamp-2">
        {project.description || t.noDescription}
      </p>
      
      <div className="mt-3 pt-3 border-t border-border flex justify-between items-center text-xs text-muted-foreground">
        <span>{new Date(project.created_at).toLocaleDateString()}</span>
        <span className="text-primary font-medium flex items-center gap-1">
          {t.open} <ArrowRight className="w-3 h-3" />
        </span>
      </div>
    </motion.div>
  );

  const renderDashboard = () => (
    <div className="space-y-4 md:space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Quick Actions Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
        <QuickActionButton icon={Plus} label={t.newProject} onClick={() => setShowCreate(true)} color="blue" />
        <QuickActionButton icon={Play} label={locale === 'zh' ? '运行任务' : 'Run Task'} onClick={openTasksTab} color="emerald" />
        <QuickActionButton icon={Upload} label={locale === 'zh' ? '上传数据' : 'Upload Data'} onClick={() => {}} color="purple" />
        <QuickActionButton icon={FlaskConical} label={t.workflowManager} onClick={openWorkflowTab} color="orange" />
      </div>

      {/* Stats Grid */}
      <StatsGrid className="mb-2">
        <StatsCard
          title={t.totalProjects}
          value={projects.length}
          icon={FolderOpen}
          trend={{ value: 12, isPositive: true }}
          onClick={openAllProjectsTab}
        />
        <StatsCard
          title={t.runningTasks}
          value={runningTasks}
          icon={Activity}
          iconClassName="bg-blue-500/20 text-blue-400"
          onClick={openTasksTab}
        />
        <StatsCard
          title={t.completedTasks}
          value={completedTasks}
          icon={TrendingUp}
          iconClassName="bg-emerald-500/20 text-emerald-400"
        />
        <StatsCard
          title={t.storageUsed}
          value={formatStorage(storageData?.used || 0)}
          subtitle={storageData ? `${formatStorage(storageData.total - storageData.used)} ${locale === 'zh' ? '可用' : 'available'}` : undefined}
          icon={HardDrive}
          iconClassName="bg-purple-500/20 text-purple-400"
        />
      </StatsGrid>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
        {/* Recent Projects */}
        <div className="md:col-span-1 lg:col-span-2 space-y-3 md:space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base md:text-lg font-semibold flex items-center gap-2">
              <Clock className="w-4 md:w-5 h-4 md:h-5 text-muted-foreground" />
              {t.recentProjects}
            </h2>
            <Button variant="ghost" size="sm" onClick={openAllProjectsTab}>
              {t.viewAll} <ArrowRight className="w-3 md:w-4 h-3 md:h-4 ml-1" />
            </Button>
          </div>
          
          {projectsLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
              {[1, 2, 3, 4].map(i => (
                <Skeleton key={i} className="h-28 md:h-32 rounded-xl" />
              ))}
            </div>
          ) : filteredProjects.length === 0 ? (
            <div className="text-center py-8 md:py-12 bg-card/50 rounded-xl border border-dashed">
              <FolderOpen className="w-10 md:w-12 h-10 md:h-12 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-muted-foreground mb-3 md:mb-4">{t.noProjects}</p>
              <Button onClick={() => setShowCreate(true)}>
                <Plus className="w-4 h-4" />
                {t.createFirst}
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
              <AnimatePresence mode="popLayout">
                {recentProjects.map((project) => (
                  <ProjectCard key={project.id} project={project} />
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* Right Sidebar */}
        <div className="space-y-3 md:space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder={t.searchPlaceholder}
              className="w-full pl-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Task Summary */}
          <div className="bg-card rounded-xl p-4 md:p-5 border border-border">
            <h3 className="font-semibold mb-3 md:mb-4 flex items-center gap-2">
              <Activity className="w-4 md:w-5 h-4 md:h-5 text-primary" />
              {locale === 'zh' ? '任务概览' : 'Task Overview'}
            </h3>
            <div className="space-y-2 md:space-y-3">
              <div className="flex items-center justify-between p-2.5 md:p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                  <span className="text-sm">{t.runningTasks}</span>
                </div>
                <span className="font-bold text-blue-400">{runningTasks}</span>
              </div>
              <div className="flex items-center justify-between p-2.5 md:p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="text-sm">{t.completedTasks}</span>
                </div>
                <span className="font-bold text-emerald-400">{completedTasks}</span>
              </div>
              <div className="flex items-center justify-between p-2.5 md:p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-red-500" />
                  <span className="text-sm">{t.failedTasks}</span>
                </div>
                <span className="font-bold text-red-400">{failedTasks}</span>
              </div>
              <Button 
                variant="outline" 
                className="w-full mt-2 md:mt-3"
                onClick={openTasksTab}
              >
                {locale === 'zh' ? '查看任务中心' : 'View Task Center'}
                <ArrowRight className="w-3 md:w-4 h-3 md:h-4 ml-2" />
              </Button>
            </div>
          </div>

          {/* Quick Links */}
          <div className="bg-card rounded-xl p-4 md:p-5 border border-border">
            <h3 className="font-semibold mb-3 md:mb-4 flex items-center gap-2">
              <Zap className="w-4 md:w-5 h-4 md:h-5 text-primary" />
              {t.quickAccess}
            </h3>
            <div className="space-y-1.5 md:space-y-2">
              <button onClick={openWorkflowTab} className="w-full flex items-center gap-2 md:gap-3 p-2.5 md:p-3 rounded-lg hover:bg-accent transition-colors text-left">
                <FlaskConical className="w-4 h-4 text-purple-400 flex-shrink-0" />
                <span className="text-sm">{t.workflowManager}</span>
              </button>
              <button onClick={openKnowledgeTab} className="w-full flex items-center gap-2 md:gap-3 p-2.5 md:p-3 rounded-lg hover:bg-accent transition-colors text-left">
                <Globe className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <span className="text-sm">{t.publicData}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderAllProjects = () => (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <Grid3X3 className="w-5 h-5 text-primary" />
          {t.allProjects}
          <span className="text-sm font-normal text-muted-foreground">({projects.length})</span>
        </h2>
        <Button onClick={() => setShowCreate(true)} className="gap-2">
          <Plus className="w-4 h-4" />
          {t.newProject}
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          type="text"
          placeholder={t.searchPlaceholder}
          className="w-full pl-9"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {projectsLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      ) : filteredProjects.length === 0 ? (
        <div className="text-center py-12 bg-card/50 rounded-xl border border-dashed">
          <FolderOpen className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-muted-foreground mb-4">{t.noProjects}</p>
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="w-4 h-4" />
            {t.createFirst}
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          <AnimatePresence mode="popLayout">
            {filteredProjects.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );

  const renderContent = () => {
    if (activeTabKey === 'dashboard') {
      return renderDashboard();
    }

    if (activeTabKey === 'all-projects') {
      return renderAllProjects();
    }

    const activeTab = tabs.find(t => t.key === activeTabKey);
    
    if (activeTab?.type === 'project' && activeTab.data?.projectId) {
      return (
        <div className="h-full">
          <ProjectWorkspace 
            projectId={activeTab.data.projectId} 
            onBack={() => closeTab(activeTabKey)} 
            isActive={true} 
          />
        </div>
      );
    }

    if (activeTab?.type === 'workflow') {
      return (
        <div className="h-full bg-background">
          <WorkflowManager onBack={() => closeTab(activeTabKey)} />
        </div>
      );
    }

    if (activeTab?.type === 'knowledge') {
      return (
        <div className="h-full flex flex-col bg-background">
          <KnowledgeBase />
        </div>
      );
    }

    if (activeTab?.type === 'tasks') {
      return (
        <div className="h-full flex flex-col bg-background">
          <TaskBoard onBack={() => closeTab(activeTabKey)} />
        </div>
      );
    }

    return null;
  };

  const openWorkflowTab = () => {
    const key = 'admin-workflows';
    if (!tabs.find(t => t.key === key)) {
      setTabs([...tabs, { 
        key, 
        label: t.workflowManager, 
        type: 'workflow',
        icon: <FlaskConical className="w-4 h-4" />
      }]);
    }
    setActiveTabKey(key);
  };

  const openKnowledgeTab = () => {
    const key = 'knowledge-base';
    if (!tabs.find(t => t.key === key)) {
      setTabs([...tabs, { 
        key, 
        label: t.publicData, 
        type: 'knowledge',
        icon: <Globe className="w-4 h-4" />
      }]);
    }
    setActiveTabKey(key);
  };

  const openTasksTab = () => {
    const key = 'task-center';
    if (!tabs.find(t => t.key === key)) {
      setTabs([...tabs, { 
        key, 
        label: t.tasks, 
        type: 'tasks',
        icon: <Activity className="w-4 h-4" />
      }]);
    }
    setActiveTabKey(key);
  };

  return (
    <AppLayout 
      breadcrumbs={getBreadcrumbs()}
      onWorkflowClick={openWorkflowTab}
      onKnowledgeClick={openKnowledgeTab}
      onTasksClick={openTasksTab}
    >
      <div className="flex flex-col h-full">
        <div className="flex-shrink-0 px-4 py-2 border-b border-border bg-card/50 backdrop-blur-sm">
          <AnimatedTabsUnderline
            tabs={tabs.map(tab => ({
              id: tab.key,
              label: tab.label,
              icon: tab.icon,
              closable: tab.key !== 'dashboard' && tab.key !== 'all-projects',
              onClose: (e) => closeTab(tab.key, e)
            }))}
            activeTab={activeTabKey}
            onChange={setActiveTabKey}
          />
        </div>
        
        <div className="flex-1 overflow-hidden">
          {renderContent()}
        </div>
      </div>
      
      {showCreate && (
        <CreateProjectModal 
          onClose={() => setShowCreate(false)} 
          onSuccess={handleCreateSuccess} 
        />
      )}
    </AppLayout>
  );
}
