'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/components/ui/Toast';
import WorkflowEditorModal from '@/components/WorkflowEditorModal';
import ConfirmModal from '@/components/ConfirmModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/Card';
import { 
  Search, Plus, Pencil, Trash2, FlaskConical, Wrench, 
  ChevronRight, Tag, Calendar, Code, Layers, X, Sparkles
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLocale } from '@/stores/localeStore';

interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  subcategory: string;
  workflow_type: string; 
  script_path: string;
  source_code: string;   
  config_code: string;   
  params_schema: string;
  is_public: boolean;
  updated_at: string;
}

interface WorkflowManagerProps {
    onBack?: () => void;
}

const translations = {
  zh: {
    title: '工作流管理',
    subtitle: '管理分析流程和自定义工具',
    createWorkflow: '创建工作流',
    createTool: '创建工具',
    searchPlaceholder: '搜索工作流...',
    noWorkflows: '暂无工作流',
    deleteConfirm: '确定删除此工作流吗？这可能会破坏现有历史记录。',
    deleted: '删除成功',
    lastUpdate: '最后更新',
  },
  en: {
    title: 'Workflow Manager',
    subtitle: 'Manage pipelines and custom tools',
    createWorkflow: 'New Workflow',
    createTool: 'New Tool',
    searchPlaceholder: 'Search workflows...',
    noWorkflows: 'No workflows yet',
    deleteConfirm: 'Delete this workflow? This might break existing history.',
    deleted: 'Deleted successfully',
    lastUpdate: 'Last updated',
  }
};

export default function WorkflowManager({ onBack }: WorkflowManagerProps) {
  const queryClient = useQueryClient();
  const { locale } = useLocale();
  const t = translations[locale];
  
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingWorkflow, setEditingWorkflow] = useState<WorkflowTemplate | undefined>(undefined);
  const [createType, setCreateType] = useState<'PIPELINE' | 'TOOL'>('PIPELINE');
  const [searchQuery, setSearchQuery] = useState('');
  const [confirmModal, setConfirmModal] = useState<{isOpen: boolean; title: string; message: string; action: () => void;}>({ isOpen: false, title: '', message: '', action: () => {} });

  const { data: workflows = [], isLoading } = useQuery<WorkflowTemplate[]>({
    queryKey: ['workflows'],
    queryFn: async () => {
      const token = localStorage.getItem('token');
      if (!token) return [];
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
      const res = await fetch(`${apiUrl}/admin/workflows`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Failed to fetch workflows");
      return res.json();
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
        const token = localStorage.getItem('token');
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
        const res = await fetch(`${apiUrl}/admin/workflows/${id}`, {
            method: 'DELETE', headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok) throw new Error("Delete failed");
    },
    onSuccess: () => {
        toast.success(t.deleted);
        queryClient.invalidateQueries({ queryKey: ['workflows'] });
    },
    onError: () => toast.error("Network error")
  });

  const handleCreate = (type: 'PIPELINE' | 'TOOL') => {
    setCreateType(type);
    setEditingWorkflow(undefined);
    setIsEditorOpen(true);
  };

  const handleEdit = (wf: WorkflowTemplate) => {
    setEditingWorkflow(wf);
    setIsEditorOpen(true);
  };

  const handleDeleteClick = (wf: WorkflowTemplate) => {
    setConfirmModal({
      isOpen: true,
      title: locale === 'zh' ? '删除工作流' : 'Delete Workflow',
      message: `${t.deleteConfirm} "${wf.name}"`,
      action: () => deleteMutation.mutate(wf.id)
    });
  };

  const filteredWorkflows = workflows.filter(wf => 
    wf.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    wf.category?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    wf.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const groupedWorkflows = filteredWorkflows.reduce((acc, wf) => {
    const key = wf.category || 'Uncategorized';
    if (!acc[key]) acc[key] = [];
    acc[key].push(wf);
    return acc;
  }, {} as Record<string, WorkflowTemplate[]>);

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'TOOL': return <Wrench className="w-3.5 h-3.5" />;
      case 'MODULE': return <Code className="w-3.5 h-3.5" />;
      default: return <FlaskConical className="w-3.5 h-3.5" />;
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'TOOL': return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
      case 'MODULE': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      default: return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
    }
  };

  return (
    <div className="h-full flex flex-col bg-background text-foreground overflow-hidden">
      {/* Header */}
      <div className="px-6 py-5 border-b border-border bg-card/50 flex-shrink-0">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center gap-3">
            {onBack && (
                <Button variant="ghost" size="icon-sm" onClick={onBack}>
                    <ChevronRight className="w-4 h-4 rotate-180" />
                </Button>
            )}
            <div>
                <h1 className="text-2xl font-bold flex items-center gap-2">
                  <Sparkles className="w-6 h-6 text-primary" />
                  {t.title}
                </h1>
                <p className="text-muted-foreground text-sm mt-1">{t.subtitle}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => handleCreate('TOOL')} className="gap-2">
              <Wrench className="w-4 h-4" />
              {t.createTool}
            </Button>
            <Button size="sm" onClick={() => handleCreate('PIPELINE')} className="gap-2">
              <Plus className="w-4 h-4" />
              {t.createWorkflow}
            </Button>
          </div>
        </div>
        
        {/* Search */}
        <div className="mt-4 relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder={t.searchPlaceholder}
            className="w-full pl-9"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <Skeleton key={i} className="h-40 rounded-xl" />
            ))}
          </div>
        ) : filteredWorkflows.length === 0 ? (
          <div className="text-center py-16">
            <FlaskConical className="w-16 h-16 mx-auto text-muted-foreground/30 mb-4" />
            <p className="text-muted-foreground">{t.noWorkflows}</p>
            <Button onClick={() => handleCreate('PIPELINE')} className="mt-4 gap-2">
              <Plus className="w-4 h-4" />
              {t.createWorkflow}
            </Button>
          </div>
        ) : (
          <div className="space-y-8">
            {Object.entries(groupedWorkflows).map(([category, items]) => (
              <div key={category}>
                <h2 className="text-sm font-semibold text-muted-foreground mb-4 flex items-center gap-2">
                  <Tag className="w-4 h-4" />
                  {category}
                  <span className="text-xs bg-muted px-2 py-0.5 rounded-full">{items.length}</span>
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {items.map(wf => (
                    <Card key={wf.id} hoverable className="group relative overflow-hidden">
                      <div className="absolute top-0 right-0 p-3">
                        <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded border flex items-center gap-1.5", getTypeColor(wf.workflow_type))}>
                          {getTypeIcon(wf.workflow_type)}
                          {wf.workflow_type}
                        </span>
                      </div>
                      <CardContent className="p-5">
                        <h3 className="font-bold text-base mb-2 pr-16">{wf.name}</h3>
                        <p className="text-muted-foreground text-sm line-clamp-2 mb-4 min-h-[40px]">
                          {wf.description || (locale === 'zh' ? '暂无描述' : 'No description')}
                        </p>
                        <div className="flex items-center justify-between pt-3 border-t border-border">
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Calendar className="w-3.5 h-3.5" />
                            {new Date(wf.updated_at).toLocaleDateString()}
                          </div>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon-sm" onClick={() => handleEdit(wf)} className="opacity-0 group-hover:opacity-100 transition-opacity">
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button variant="ghost" size="icon-sm" onClick={() => handleDeleteClick(wf)} className="opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive">
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {isEditorOpen && (
          <WorkflowEditorModal 
              initialData={editingWorkflow} 
              defaultType={createType} 
              onClose={() => setIsEditorOpen(false)} 
              onSave={() => queryClient.invalidateQueries({ queryKey: ['workflows'] })} 
          />
      )}
      <ConfirmModal 
        isOpen={confirmModal.isOpen} 
        title={confirmModal.title} 
        message={confirmModal.message} 
        onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))} 
        onConfirm={() => { confirmModal.action(); setConfirmModal(prev => ({ ...prev, isOpen: false })); }} 
      />
    </div>
  );
}
