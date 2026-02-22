'use client';

import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';

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

export default function KnowledgeBase() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PublicDataset[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  
  // 👇 新增：用于在界面上展示动态搜索进度的状态
  const [searchProgress, setSearchProgress] = useState('');
  
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

  // 👇 核心升级：流式读取 (Stream Reader)
  const searchMutation = useMutation({
    mutationFn: async (searchQuery: string) => {
      setResults([]);
      setHasSearched(false);
      setSearchProgress('Connecting to AI Server...');
      
      const token = localStorage.getItem('token');
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/knowledge/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ query: searchQuery, top_k: 10 })
      });
      
      if (!res.ok) throw new Error('Search failed');
      
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error('No stream reader available');
      
      let finalData: PublicDataset[] = [];
      let buffer = '';
      
      // 不断读取二进制流
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        // 将二进制解码并拼接到 buffer 中
        buffer += decoder.decode(value, { stream: true });
        
        // 按换行符切分 NDJSON
        const lines = buffer.split('\n');
        // 最后一行可能没接收完，将其留到下一个循环的 buffer 中
        buffer = lines.pop() || ''; 
        
        for (const line of lines) {
          if (line.trim()) {
            try {
              const parsed = JSON.parse(line);
              // 根据后端的指令更新 UI
              if (parsed.status === 'complete') {
                finalData = parsed.data;
                setSearchProgress('');
              } else if (parsed.status === 'error') {
                throw new Error(parsed.message);
              } else {
                setSearchProgress(parsed.message); // 实时更新界面提示词
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
      toast.success(`Successfully imported ${selectedDataset?.accession}!`);
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
    <div className="flex-1 overflow-y-auto p-8 bg-gray-950 text-white relative">
      <div className="max-w-5xl mx-auto space-y-8">
        
        <div className="text-center space-y-4 py-8">
          <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-emerald-400">
            Global Knowledge Base
          </h1>
          <p className="text-gray-400 text-sm max-w-2xl mx-auto">
            Search millions of public datasets (GEO, TCGA, etc.) using natural language. 
          </p>

          <form onSubmit={handleSearch} className="mt-8 flex justify-center">
            <div className="relative w-full max-w-3xl flex items-center">
              <div className="absolute left-4 text-gray-400">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              </div>
              <input 
                type="text" 
                className="w-full bg-gray-900 border border-gray-700 rounded-full py-4 pl-12 pr-32 text-white outline-none focus:border-blue-500 shadow-lg"
                placeholder="e.g., Are there any transcriptomic datasets for paclitaxel-resistant breast cancer?"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <button 
                type="submit" 
                disabled={searchMutation.isPending || !query.trim()}
                className="absolute right-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 text-white px-6 py-2 rounded-full font-medium transition-colors"
              >
                {searchMutation.isPending ? 'Searching...' : 'Search'}
              </button>
            </div>
          </form>
        </div>

        <div className="space-y-6">
          {/* 👇 完美呈现流式进度的加载器 */}
          {searchMutation.isPending && (
            <div className="flex flex-col items-center justify-center py-16 gap-6 bg-[#0f1218] border border-gray-800 rounded-xl shadow-inner">
               <span className="relative flex h-10 w-10">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-10 w-10 bg-blue-500"></span>
               </span>
               <p className="text-blue-400 font-medium text-lg animate-pulse tracking-wide">
                  {searchProgress || 'Initializing...'}
               </p>
            </div>
          )}

          {!searchMutation.isPending && hasSearched && results.length === 0 && (
             <div className="text-center py-12 text-gray-500 bg-[#0f1218] border border-gray-800 rounded-xl">No matching datasets found. Try different keywords.</div>
          )}

          {!searchMutation.isPending && results.map((dataset) => (
            <div key={dataset.id} className="bg-[#0f1218] border border-gray-800 rounded-xl p-6 hover:border-gray-600 transition-all shadow-md group animate-in fade-in slide-in-from-bottom-2">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <span className="bg-blue-900/30 text-blue-400 px-2.5 py-1 rounded text-xs font-bold border border-blue-800/50">{dataset.accession}</span>
                    <h3 className="text-lg font-bold text-white group-hover:text-blue-400 transition-colors">{dataset.title}</h3>
                  </div>
                  <p className="text-gray-400 text-sm leading-relaxed mb-4">{dataset.summary}</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 mb-6">
                {dataset.organism && <span className="px-3 py-1 bg-gray-900 border border-gray-700 rounded-full text-xs text-gray-300">🧬 {dataset.organism}</span>}
                {dataset.disease_state && <span className="px-3 py-1 bg-red-900/20 border border-red-900/50 rounded-full text-xs text-red-300">🦠 {dataset.disease_state}</span>}
                {dataset.sample_count > 0 && <span className="px-3 py-1 bg-emerald-900/20 border border-emerald-900/50 rounded-full text-xs text-emerald-300">📊 {dataset.sample_count} Samples</span>}
              </div>

              <div className="flex justify-between items-center pt-4 border-t border-gray-800/50">
                <a href={dataset.url} target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:text-white text-sm">View Original Source ↗</a>
                <button onClick={() => openImportModal(dataset)} className="bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm font-medium border border-gray-700 flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                  Import
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {isModalOpen && selectedDataset && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100]">
          <div className="bg-gray-900 p-6 rounded-xl border border-gray-700 w-[28rem] shadow-2xl">
            <h3 className="text-xl font-bold text-white mb-2">Import Dataset</h3>
            <p className="text-sm text-gray-400 mb-6">Select a project to import <span className="text-blue-400 font-bold">{selectedDataset.accession}</span> into.</p>
            
            {projects.length === 0 ? (
                <div className="text-yellow-500 text-sm mb-4">No projects available. Create one first.</div>
            ) : (
                <select className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white mb-6 outline-none focus:border-blue-500" value={selectedProjectId} onChange={(e) => setSelectedProjectId(e.target.value)}>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
            )}

            <div className="flex justify-end gap-3">
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-white text-sm px-4">Cancel</button>
              <button onClick={() => importMutation.mutate()} disabled={importMutation.isPending || projects.length === 0} className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors">
                  {importMutation.isPending ? 'Importing...' : 'Confirm Import'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}