'use client';

import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Search, Globe, Database, ExternalLink, Download, 
  Loader2, Sparkles, Filter, X, ChevronRight, 
  Dna, Activity, FileText, ArrowRight
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLocale } from '@/stores/localeStore';

interface PublicDataset {
  id: string;
  accession: string;
  title: string;
  summary: string;
  organism: string;
  disease_state: string;
  sample_count: number;
  url: string;
}

interface Project { id: string; name: string; }

const translations = {
  zh: {
    title: '公共数据库',
    subtitle: '搜索 GEO、TCGA 等公共数据集，使用自然语言',
    searchPlaceholder: '例如：紫杉醇耐药的乳腺癌转录组数据集',
    searching: '搜索中...',
    noResults: '未找到匹配的数据集，请尝试其他关键词',
    import: '导入',
    importing: '导入中...',
    selectProject: '选择项目',
    noProjects: '暂无可用项目，请先创建项目',
    cancel: '取消',
    confirm: '确认导入',
    viewSource: '查看原始数据',
    fastSearch: '快速本地搜索',
    deepSearch: '深度 AI 搜索',
    samples: '样本数',
    organism: '物种',
    disease: '疾病状态',
  },
  en: {
    title: 'Public Databases',
    subtitle: 'Search public datasets (GEO, TCGA, etc.) using natural language',
    searchPlaceholder: 'e.g., transcriptomic datasets for paclitaxel-resistant breast cancer',
    searching: 'Searching...',
    noResults: 'No matching datasets found. Try different keywords.',
    import: 'Import',
    importing: 'Importing...',
    selectProject: 'Select Project',
    noProjects: 'No projects available. Create one first.',
    cancel: 'Cancel',
    confirm: 'Confirm Import',
    viewSource: 'View Source',
    fastSearch: 'Fast Local Search',
    deepSearch: 'Deep AI Search',
    samples: 'Samples',
    organism: 'Organism',
    disease: 'Disease',
  }
};

export default function KnowledgeBase() {
  const { locale } = useLocale();
  const t = translations[locale];
  
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PublicDataset[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchProgress, setSearchProgress] = useState('');
  const [searchMode, setSearchMode] = useState<'llm' | 'vector'>('llm');
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedDataset, setSelectedDataset] = useState<PublicDataset | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState('');

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ['projects'],
    queryFn: async () => {
      const token = localStorage.getItem('token');
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/files/projects`, { 
        headers: { 'Authorization': `Bearer ${token}` } 
      });
      if (!res.ok) throw new Error('Failed to fetch projects');
      return res.json();
    }
  });

  const searchMutation = useMutation({
    mutationFn: async (searchQuery: string) => {
      setResults([]);
      setHasSearched(false);
      setSearchProgress(searchMode === 'llm' ? 'Connecting to AI Server...' : 'Connecting to Vector Database...');
      
      const token = localStorage.getItem('token');
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/knowledge/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ query: searchQuery, top_k: 10, mode: searchMode })
      });
      
      if (!res.ok) throw new Error('Search failed');
      
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error('No stream reader available');
      
      let finalData: PublicDataset[] = [];
      let buffer = '';
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; 
        
        for (const line of lines) {
          if (line.trim()) {
            try {
              const parsed = JSON.parse(line);
              if (parsed.status === 'complete') {
                finalData = parsed.data;
                setSearchProgress('');
              } else if (parsed.status === 'error') {
                throw new Error(parsed.message);
              } else {
                setSearchProgress(parsed.message);
              }
            } catch (e) {
              console.error("Parse error on stream chunk:", line);
            }
          }
        }
      }
      return finalData;
    },
    onSuccess: (data) => {
      setResults(data);
      setHasSearched(true);
    },
    onError: (err: any) => {
      toast.error(`Search Error: ${err.message}`);
      setSearchProgress('');
    }
  });

  const importMutation = useMutation({
    mutationFn: async () => {
      if (!selectedDataset || !selectedProjectId) throw new Error("Missing data");
      const token = localStorage.getItem('token');
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/knowledge/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ dataset_id: selectedDataset.id, project_id: selectedProjectId })
      });
      if (!res.ok) throw new Error('Import failed');
      return res.json();
    },
    onSuccess: () => {
      toast.success(`${locale === 'zh' ? '成功导入' : 'Successfully imported'} ${selectedDataset?.accession}!`);
      setIsModalOpen(false);
    },
    onError: (err: any) => toast.error(`Import Error: ${err.message}`)
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    searchMutation.mutate(query);
  };

  const openImportModal = (dataset: PublicDataset) => {
    setSelectedDataset(dataset);
    if (projects.length > 0) setSelectedProjectId(projects[0].id);
    setIsModalOpen(true);
  };

  return (
    <div className="h-full flex flex-col bg-background text-foreground overflow-hidden">
      {/* Hero Section */}
      <div className="relative px-6 py-10 border-b border-border bg-gradient-to-b from-card to-background overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/10 via-transparent to-transparent" />
        <div className="relative max-w-4xl mx-auto text-center space-y-6">
          <div className="flex items-center justify-center gap-3">
            <div className="p-3 rounded-2xl bg-primary/20">
              <Globe className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-3xl font-bold">{t.title}</h1>
          </div>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            {t.subtitle}
          </p>

          {/* Search Form */}
          <form onSubmit={handleSearch} className="mt-8">
            <div className="relative max-w-2xl mx-auto">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input 
                type="text" 
                className="w-full h-14 pl-12 pr-36 text-lg bg-card border-2 focus:border-primary transition-colors"
                placeholder={t.searchPlaceholder}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <Button 
                type="submit" 
                disabled={searchMutation.isPending || !query.trim()}
                className="absolute right-2 top-1/2 -translate-y-1/2 h-10 px-6"
              >
                {searchMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Search className="w-4 h-4 mr-2" />
                    {locale === 'zh' ? '搜索' : 'Search'}
                  </>
                )}
              </Button>
            </div>

            {/* Search Mode Toggle */}
            <div className="flex justify-center mt-4">
              <div className="inline-flex items-center gap-1 p-1 bg-card rounded-lg border border-border">
                <button
                  type="button"
                  onClick={() => setSearchMode('vector')}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all",
                    searchMode === 'vector' 
                      ? "bg-primary text-primary-foreground shadow" 
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Activity className="w-4 h-4" />
                  {t.fastSearch}
                </button>
                <div className="w-px h-6 bg-border" />
                <button
                  type="button"
                  onClick={() => setSearchMode('llm')}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all",
                    searchMode === 'llm' 
                      ? "bg-primary text-primary-foreground shadow" 
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Sparkles className="w-4 h-4" />
                  {t.deepSearch}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* Loading State */}
        {searchMutation.isPending && (
          <div className="flex flex-col items-center justify-center py-16 gap-6">
            <div className="relative">
              <Loader2 className={cn("w-10 h-10 animate-spin", searchMode === 'llm' ? 'text-purple-500' : 'text-blue-500')} />
            </div>
            <div className="text-center">
              <p className={cn("font-medium text-lg animate-pulse", searchMode === 'llm' ? 'text-purple-400' : 'text-blue-400')}>
                {searchProgress || (locale === 'zh' ? '初始化中...' : 'Initializing...')}
              </p>
            </div>
          </div>
        )}

        {/* Empty Results */}
        {!searchMutation.isPending && hasSearched && results.length === 0 && (
          <div className="text-center py-16">
            <Database className="w-16 h-16 mx-auto text-muted-foreground/30 mb-4" />
            <p className="text-muted-foreground">{t.noResults}</p>
          </div>
        )}

        {/* Results List */}
        {!searchMutation.isPending && results.length > 0 && (
          <div className="max-w-4xl mx-auto space-y-4">
            {results.map((dataset) => (
              <Card key={dataset.id} hoverable className="group">
                <CardContent className="p-5">
                  <div className="flex flex-col lg:flex-row lg:items-start gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2 flex-wrap">
                        <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-primary/20 text-primary border border-primary/30">
                          {dataset.accession}
                        </span>
                        <h3 className="text-lg font-bold group-hover:text-primary transition-colors">
                          {dataset.title}
                        </h3>
                      </div>
                      <p className="text-muted-foreground text-sm leading-relaxed mb-4">
                        {dataset.summary}
                      </p>
                      
                      <div className="flex flex-wrap gap-2">
                        {dataset.organism && (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-card border border-border rounded-full text-xs">
                            <Dna className="w-3.5 h-3.5 text-emerald-500" />
                            {dataset.organism}
                          </span>
                        )}
                        {dataset.disease_state && (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-red-500/10 border border-red-500/30 rounded-full text-xs text-red-400">
                            <Activity className="w-3.5 h-3.5" />
                            {dataset.disease_state}
                          </span>
                        )}
                        {dataset.sample_count > 0 && (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-500/10 border border-blue-500/30 rounded-full text-xs text-blue-400">
                            <FileText className="w-3.5 h-3.5" />
                            {dataset.sample_count} {t.samples}
                          </span>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex flex-col gap-2 lg:w-40 flex-shrink-0">
                      <Button variant="outline" size="sm" asChild>
                        <a href={dataset.url} target="_blank" rel="noopener noreferrer" className="gap-2">
                          <ExternalLink className="w-4 h-4" />
                          {t.viewSource}
                        </a>
                      </Button>
                      <Button size="sm" onClick={() => openImportModal(dataset)} className="gap-2">
                        <Download className="w-4 h-4" />
                        {t.import}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
        
        {/* Initial State */}
        {!hasSearched && !searchMutation.isPending && (
          <div className="text-center py-16">
            <Globe className="w-20 h-20 mx-auto text-muted-foreground/20 mb-6" />
            <h3 className="text-xl font-semibold mb-2">
              {locale === 'zh' ? '探索公共数据' : 'Explore Public Data'}
            </h3>
            <p className="text-muted-foreground max-w-md mx-auto">
              {locale === 'zh' 
                ? '输入关键词搜索 GEO、TCGA 等公共数据库中的转录组、基因组数据集' 
                : 'Enter keywords to search for transcriptomics and genomics datasets in public databases like GEO and TCGA'}
            </p>
          </div>
        )}
      </div>

      {/* Import Modal */}
      {isModalOpen && selectedDataset && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100] animate-in fade-in duration-200">
          <div className="bg-card border border-border p-6 rounded-xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold">{locale === 'zh' ? '导入数据集' : 'Import Dataset'}</h3>
              <Button variant="ghost" size="icon-sm" onClick={() => setIsModalOpen(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
            
            <p className="text-muted-foreground mb-4">
              {locale === 'zh' ? '选择项目导入' : 'Select a project to import'} 
              <span className="text-primary font-bold ml-1">{selectedDataset.accession}</span>
            </p>
            
            {projects.length === 0 ? (
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4 mb-4">
                <p className="text-yellow-500 text-sm">{t.noProjects}</p>
              </div>
            ) : (
              <select 
                className="w-full bg-background border border-input rounded-lg p-3 mb-6 outline-none focus:border-primary"
                value={selectedProjectId} 
                onChange={(e) => setSelectedProjectId(e.target.value)}
              >
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            )}

            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setIsModalOpen(false)}>
                {t.cancel}
              </Button>
              <Button 
                onClick={() => importMutation.mutate()} 
                disabled={importMutation.isPending || projects.length === 0}
                className="gap-2"
              >
                {importMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                {t.confirm}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
