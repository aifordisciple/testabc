'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';

interface SampleManagerProps { projectId: string; }
interface SampleSheet { id: string; name: string; description: string; created_at: string; }
interface Sample { id: string; name: string; group: string; replicate: number; }
interface ProjectFile { id: string; filename: string; s3_key: string; is_directory: boolean; }

const fetchAPI = async (endpoint: string) => {
    const token = localStorage.getItem('token');
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}${endpoint}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`API error: ${endpoint}`);
    return res.json();
};

export default function SampleManager({ projectId }: SampleManagerProps) {
  const queryClient = useQueryClient();
  const [activeSheetId, setActiveSheetId] = useState<string | null>(null);

  // --- UI 表单状态 ---
  const [showCreateSheet, setShowCreateSheet] = useState(false);
  const [newSheetName, setNewSheetName] = useState('');
  const [newSheetDesc, setNewSheetDesc] = useState('');

  const [showAddSample, setShowAddSample] = useState(false);
  const [newSample, setNewSample] = useState({ name: '', group: 'control', replicate: 1, r1_file_id: '', r2_file_id: '' });

  // --- React Query: 获取数据 ---
  const { data: sheets = [], isLoading: sheetsLoading } = useQuery<SampleSheet[]>({
      queryKey: ['sampleSheets', projectId],
      queryFn: () => fetchAPI(`/workflow/projects/${projectId}/sample_sheets`)
  });

  const { data: samples = [], isLoading: samplesLoading } = useQuery<Sample[]>({
      queryKey: ['samples', activeSheetId],
      queryFn: () => fetchAPI(`/workflow/sample_sheets/${activeSheetId}/samples`),
      enabled: !!activeSheetId // 只有选中了 Sheet 才会发请求
  });

  const { data: filesData } = useQuery({
      queryKey: ['files', projectId, 'recursive'],
      queryFn: () => fetchAPI(`/files/projects/${projectId}/files?recursive=true`),
  });
  const files: ProjectFile[] = filesData?.files?.filter((f: ProjectFile) => !f.is_directory) || [];

  // --- 副作用 ---
  useEffect(() => {
    if (sheets.length > 0 && !activeSheetId) {
      setActiveSheetId(sheets[0].id);
    } else if (sheets.length === 0) {
      setActiveSheetId(null);
    }
  }, [sheets, activeSheetId]);

  // --- Mutations ---
  const actionMutation = useMutation({
    mutationFn: async ({ url, method, body }: { url: string, method: string, body?: any }) => {
        const token = localStorage.getItem('token');
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}${url}`, {
            method,
            headers: { 'Authorization': `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
            body: body ? JSON.stringify(body) : undefined
        });
        if (!res.ok) throw new Error('Request failed');
        return res.json();
    },
    onSuccess: (_, variables) => {
        // 根据 URL 智能刷新缓存
        if (variables.url.includes('sample_sheets')) {
            queryClient.invalidateQueries({ queryKey: ['sampleSheets', projectId] });
        }
        if (variables.url.includes('samples')) {
            queryClient.invalidateQueries({ queryKey: ['samples', activeSheetId] });
        }
    },
    onError: () => toast.error("Action failed")
  });

  const handleCreateSheet = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSheetName.trim()) return;
    actionMutation.mutate({
        url: `/workflow/projects/${projectId}/sample_sheets`, method: 'POST',
        body: { name: newSheetName, description: newSheetDesc, project_id: projectId }
    }, { onSuccess: () => { toast.success('Sheet created'); setShowCreateSheet(false); setNewSheetName(''); setNewSheetDesc(''); }});
  };

  const handleAddSample = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSample.name || !newSample.group || !newSample.r1_file_id) return toast.error("Please fill required fields.");
    actionMutation.mutate({
        url: `/workflow/sample_sheets/${activeSheetId}/samples`, method: 'POST', body: newSample
    }, { onSuccess: () => { toast.success('Sample added'); setShowAddSample(false); setNewSample({ name: '', group: 'control', replicate: 1, r1_file_id: '', r2_file_id: '' }); }});
  };

  if (sheetsLoading) return <div className="text-gray-500 animate-pulse">Loading Sample Sheets...</div>;

  return (
    <div className="flex gap-8 h-full">
      {/* Sidebar: Sample Sheets List */}
      <div className="w-1/3 border-r border-gray-800 pr-6 flex flex-col">
        <div className="flex justify-between items-center mb-6">
          <h3 className="font-bold text-white text-lg">Sample Sheets</h3>
          <button onClick={() => setShowCreateSheet(true)} className="bg-gray-800 hover:bg-gray-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-700 transition-colors">+ New</button>
        </div>

        {showCreateSheet && (
          <form onSubmit={handleCreateSheet} className="bg-gray-900 border border-gray-700 p-4 rounded-xl mb-4 shadow-lg animate-in fade-in duration-200">
            <input className="w-full bg-gray-950 border border-gray-800 rounded px-3 py-2 text-sm text-white mb-3 focus:border-blue-500 outline-none" placeholder="Sheet Name" value={newSheetName} onChange={e => setNewSheetName(e.target.value)} autoFocus required />
            <input className="w-full bg-gray-950 border border-gray-800 rounded px-3 py-2 text-sm text-white mb-4 focus:border-blue-500 outline-none" placeholder="Description (Optional)" value={newSheetDesc} onChange={e => setNewSheetDesc(e.target.value)} />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowCreateSheet(false)} className="text-gray-400 hover:text-white text-xs px-2">Cancel</button>
              <button type="submit" disabled={actionMutation.isPending} className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg text-xs font-medium">{actionMutation.isPending ? 'Saving...' : 'Save'}</button>
            </div>
          </form>
        )}

        <div className="space-y-3 overflow-y-auto flex-1 pr-2">
          {sheets.length === 0 && !showCreateSheet && <div className="text-gray-500 text-sm italic">No sheets created yet.</div>}
          {sheets.map(sheet => (
            <div 
                key={sheet.id} 
                onClick={() => setActiveSheetId(sheet.id)}
                className={`p-4 rounded-xl cursor-pointer border transition-all group relative ${activeSheetId === sheet.id ? 'bg-blue-900/20 border-blue-500/50 shadow-[0_0_15px_rgba(59,130,246,0.1)]' : 'bg-gray-900 border-gray-800 hover:border-gray-600'}`}
            >
              <h4 className={`font-bold ${activeSheetId === sheet.id ? 'text-blue-400' : 'text-gray-200'}`}>{sheet.name}</h4>
              <p className="text-xs text-gray-500 mt-1 line-clamp-2">{sheet.description || 'No description'}</p>
              <button 
                  onClick={(e) => { e.stopPropagation(); if(confirm('Delete this sheet?')) actionMutation.mutate({ url: `/workflow/sample_sheets/${sheet.id}`, method: 'DELETE' }); }}
                  className="absolute top-3 right-3 text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
              >✕</button>
            </div>
          ))}
        </div>
      </div>

      {/* Main Content: Samples in selected Sheet */}
      <div className="flex-1 flex flex-col">
        {!activeSheetId ? (
            <div className="flex-1 flex items-center justify-center text-gray-500">Select or create a sample sheet to manage samples.</div>
        ) : (
          <>
            <div className="flex justify-between items-center mb-6 bg-gray-900/50 p-4 rounded-xl border border-gray-800">
              <div>
                <h3 className="font-bold text-white text-lg">Samples</h3>
                <p className="text-xs text-gray-400 mt-0.5">Manage biological replicates and fastq associations.</p>
              </div>
              <button onClick={() => setShowAddSample(true)} className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-medium shadow-lg shadow-emerald-900/20 flex items-center gap-2 transition-all">
                <span>+</span> Add Sample
              </button>
            </div>

            {showAddSample && (
               <div className="bg-gray-900 border border-gray-700 p-5 rounded-xl mb-6 shadow-xl animate-in fade-in duration-200">
                  <h4 className="text-sm font-bold text-gray-300 mb-4 uppercase tracking-wider">New Sample Entry</h4>
                  <form onSubmit={handleAddSample} className="grid grid-cols-2 gap-4">
                      <div>
                          <label className="block text-xs text-gray-500 mb-1">Sample ID *</label>
                          <input className="w-full bg-gray-950 border border-gray-800 rounded px-3 py-2 text-sm text-white focus:border-blue-500 outline-none" value={newSample.name} onChange={e => setNewSample({...newSample, name: e.target.value})} placeholder="e.g., WT_Rep1" required />
                      </div>
                      <div>
                          <label className="block text-xs text-gray-500 mb-1">Condition/Group *</label>
                          <input className="w-full bg-gray-950 border border-gray-800 rounded px-3 py-2 text-sm text-white focus:border-blue-500 outline-none" value={newSample.group} onChange={e => setNewSample({...newSample, group: e.target.value})} placeholder="e.g., control or treated" required />
                      </div>
                      <div>
                          <label className="block text-xs text-gray-500 mb-1">Replicate Number</label>
                          <input type="number" min="1" className="w-full bg-gray-950 border border-gray-800 rounded px-3 py-2 text-sm text-white focus:border-blue-500 outline-none" value={newSample.replicate} onChange={e => setNewSample({...newSample, replicate: parseInt(e.target.value)})} required />
                      </div>
                      <div className="col-span-2 grid grid-cols-2 gap-4 mt-2 pt-4 border-t border-gray-800">
                          <div>
                              <label className="block text-xs font-bold text-emerald-500 mb-1">Read 1 (R1) File *</label>
                              <select className="w-full bg-gray-950 border border-gray-800 rounded px-3 py-2 text-sm text-white focus:border-emerald-500 outline-none" value={newSample.r1_file_id} onChange={e => setNewSample({...newSample, r1_file_id: e.target.value})} required>
                                  <option value="">-- Select File --</option>
                                  {files.map(f => <option key={f.id} value={f.id}>{f.filename}</option>)}
                              </select>
                          </div>
                          <div>
                              <label className="block text-xs font-bold text-blue-500 mb-1">Read 2 (R2) File (Optional)</label>
                              <select className="w-full bg-gray-950 border border-gray-800 rounded px-3 py-2 text-sm text-white focus:border-blue-500 outline-none" value={newSample.r2_file_id} onChange={e => setNewSample({...newSample, r2_file_id: e.target.value})}>
                                  <option value="">-- Select File (Single-end if empty) --</option>
                                  {files.map(f => <option key={f.id} value={f.id}>{f.filename}</option>)}
                              </select>
                          </div>
                      </div>
                      <div className="col-span-2 flex justify-end gap-3 mt-4">
                          <button type="button" onClick={() => setShowAddSample(false)} className="text-gray-400 hover:text-white text-sm px-3">Cancel</button>
                          <button type="submit" disabled={actionMutation.isPending} className="bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2 rounded-lg text-sm font-medium transition-all shadow-lg">{actionMutation.isPending ? 'Saving...' : 'Confirm Save'}</button>
                      </div>
                  </form>
               </div>
            )}

            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden shadow-xl flex-1">
              <table className="w-full text-left">
                <thead className="bg-gray-800/50 text-gray-400 text-xs uppercase tracking-wider">
                  <tr><th className="px-6 py-4 font-medium">Sample ID</th><th className="px-6 py-4 font-medium">Group</th><th className="px-6 py-4 font-medium">Rep</th><th className="px-6 py-4 font-medium text-right">Actions</th></tr>
                </thead>
                <tbody className="divide-y divide-gray-800 text-sm">
                  {samplesLoading && <tr><td colSpan={4} className="p-8 text-center text-gray-500 animate-pulse">Loading samples...</td></tr>}
                  {!samplesLoading && samples.length === 0 && <tr><td colSpan={4} className="p-12 text-center text-gray-500">No samples in this sheet.</td></tr>}
                  {samples.map((s) => (
                    <tr key={s.id} className="hover:bg-gray-800/30 transition-colors group">
                      <td className="px-6 py-4 font-bold text-white">{s.name}</td>
                      <td className="px-6 py-4"><span className="px-2.5 py-1 bg-gray-800 text-gray-300 rounded-md text-xs border border-gray-700">{s.group}</span></td>
                      <td className="px-6 py-4 text-gray-400 font-mono">{s.replicate}</td>
                      <td className="px-6 py-4 text-right">
                        <button onClick={() => { if(confirm('Delete sample?')) actionMutation.mutate({ url: `/workflow/samples/${s.id}`, method: 'DELETE' }); }} className="text-gray-500 hover:text-red-400 font-medium opacity-0 group-hover:opacity-100 transition-opacity p-1.5 hover:bg-red-900/20 rounded">Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}