'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Plus, Trash2, FlaskConical, FileText, ChevronRight
} from 'lucide-react';

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

  const [showCreateSheet, setShowCreateSheet] = useState(false);
  const [newSheetName, setNewSheetName] = useState('');
  const [newSheetDesc, setNewSheetDesc] = useState('');

  const [showAddSample, setShowAddSample] = useState(false);
  const [newSample, setNewSample] = useState({ name: '', group: 'control', replicate: 1, r1_file_id: '', r2_file_id: '' });

  const { data: sheets = [], isLoading: sheetsLoading } = useQuery<SampleSheet[]>({
      queryKey: ['sampleSheets', projectId],
      queryFn: () => fetchAPI(`/workflow/projects/${projectId}/sample_sheets`)
  });

  const { data: samples = [], isLoading: samplesLoading } = useQuery<Sample[]>({
      queryKey: ['samples', activeSheetId],
      queryFn: () => fetchAPI(`/workflow/sample_sheets/${activeSheetId}/samples`),
      enabled: !!activeSheetId
  });

  const { data: filesData } = useQuery({
      queryKey: ['files', projectId, 'recursive'],
      queryFn: () => fetchAPI(`/files/projects/${projectId}/files?recursive=true`),
  });
  const files: ProjectFile[] = filesData?.files?.filter((f: ProjectFile) => !f.is_directory) || [];

  useEffect(() => {
    if (sheets.length > 0 && !activeSheetId) {
      setActiveSheetId(sheets[0].id);
    } else if (sheets.length === 0) {
      setActiveSheetId(null);
    }
  }, [sheets, activeSheetId]);

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

  const handleDeleteSheet = (sheetId: string) => {
    if (confirm('Delete this sheet?')) {
      actionMutation.mutate({ url: `/workflow/sample_sheets/${sheetId}`, method: 'DELETE' });
    }
  };

  const handleDeleteSample = (sampleId: string) => {
    if (confirm('Delete sample?')) {
      actionMutation.mutate({ url: `/workflow/samples/${sampleId}`, method: 'DELETE' });
    }
  };

  if (sheetsLoading) {
    return (
      <div className="flex items-center justify-center h-full p-6">
        <div className="w-full space-y-4">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-6 h-full">
      {/* Sidebar: Sample Sheets List */}
      <div className="w-80 border-r border-border pr-6 flex flex-col flex-shrink-0">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-semibold flex items-center gap-2">
            <FlaskConical className="w-5 h-5 text-primary" />
            Sample Sheets
          </h3>
          <Button size="sm" onClick={() => setShowCreateSheet(true)} className="gap-1">
            <Plus className="w-3.5 h-3.5" />
            New
          </Button>
        </div>

        {showCreateSheet && (
          <Card className="mb-4">
            <CardContent className="p-4">
              <form onSubmit={handleCreateSheet} className="space-y-3">
                <Input 
                  placeholder="Sheet Name" 
                  value={newSheetName} 
                  onChange={e => setNewSheetName(e.target.value)} 
                  required 
                />
                <Input 
                  placeholder="Description (Optional)" 
                  value={newSheetDesc} 
                  onChange={e => setNewSheetDesc(e.target.value)} 
                />
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="ghost" size="sm" onClick={() => setShowCreateSheet(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" size="sm" disabled={actionMutation.isPending}>
                    {actionMutation.isPending ? 'Saving...' : 'Save'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        <div className="space-y-2 overflow-y-auto flex-1 pr-2">
          {sheets.length === 0 && !showCreateSheet && (
            <div className="text-muted-foreground text-sm italic py-4 text-center">
              No sheets created yet.
            </div>
          )}
          {sheets.map(sheet => (
            <div 
                key={sheet.id} 
                onClick={() => setActiveSheetId(sheet.id)}
                className={cn(
                  "p-4 rounded-xl cursor-pointer border transition-all group relative",
                  activeSheetId === sheet.id 
                    ? "bg-primary/10 border-primary/50" 
                    : "bg-card border-border hover:border-border"
                )}
            >
              <div className="flex items-start justify-between">
                <div>
                  <h4 className={cn("font-semibold", activeSheetId === sheet.id ? "text-primary" : "")}>{sheet.name}</h4>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{sheet.description || 'No description'}</p>
                </div>
                <Button 
                  variant="ghost" 
                  size="icon-sm" 
                  onClick={(e) => { e.stopPropagation(); handleDeleteSheet(sheet.id); }}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Main Content: Samples in selected Sheet */}
      <div className="flex-1 flex flex-col min-w-0">
        {!activeSheetId ? (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              Select or create a sample sheet to manage samples.
            </div>
        ) : (
          <>
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="text-lg font-semibold">Samples</h3>
                <p className="text-sm text-muted-foreground">Manage biological replicates and fastq associations.</p>
              </div>
              <Button onClick={() => setShowAddSample(true)} className="gap-2">
                <Plus className="w-4 h-4" />
                Add Sample
              </Button>
            </div>

            {showAddSample && (
               <Card className="mb-4">
                 <CardContent className="p-5">
                    <h4 className="text-sm font-semibold mb-4 uppercase tracking-wider text-muted-foreground">New Sample Entry</h4>
                    <form onSubmit={handleAddSample} className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs text-muted-foreground mb-1">Sample ID *</label>
                            <Input 
                              placeholder="e.g., WT_Rep1" 
                              value={newSample.name} 
                              onChange={e => setNewSample({...newSample, name: e.target.value})} 
                              required 
                            />
                        </div>
                        <div>
                            <label className="block text-xs text-muted-foreground mb-1">Condition/Group *</label>
                            <Input 
                              placeholder="e.g., control or treated" 
                              value={newSample.group} 
                              onChange={e => setNewSample({...newSample, group: e.target.value})} 
                              required 
                            />
                        </div>
                        <div>
                            <label className="block text-xs text-muted-foreground mb-1">Replicate Number</label>
                            <Input 
                              type="number" 
                              min="1" 
                              value={newSample.replicate} 
                              onChange={e => setNewSample({...newSample, replicate: parseInt(e.target.value)})} 
                              required 
                            />
                        </div>
                        <div className="col-span-2 grid grid-cols-2 gap-4 pt-4 border-t border-border">
                            <div>
                                <label className="block text-xs font-semibold text-emerald-500 mb-1">Read 1 (R1) File *</label>
                                <select 
                                  className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm outline-none focus:border-primary"
                                  value={newSample.r1_file_id} 
                                  onChange={e => setNewSample({...newSample, r1_file_id: e.target.value})} 
                                  required
                                >
                                    <option value="">-- Select File --</option>
                                    {files.map(f => <option key={f.id} value={f.id}>{f.filename}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-blue-500 mb-1">Read 2 (R2) File (Optional)</label>
                                <select 
                                  className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm outline-none focus:border-primary"
                                  value={newSample.r2_file_id} 
                                  onChange={e => setNewSample({...newSample, r2_file_id: e.target.value})}
                                >
                                    <option value="">-- Select File (Single-end if empty) --</option>
                                    {files.map(f => <option key={f.id} value={f.id}>{f.filename}</option>)}
                                </select>
                            </div>
                        </div>
                        <div className="col-span-2 flex justify-end gap-3 mt-4">
                            <Button type="button" variant="ghost" onClick={() => setShowAddSample(false)}>
                                Cancel
                            </Button>
                            <Button type="submit" disabled={actionMutation.isPending}>
                                {actionMutation.isPending ? 'Saving...' : 'Confirm Save'}
                            </Button>
                        </div>
                    </form>
                 </CardContent>
               </Card>
            )}

            <Card className="flex-1 overflow-hidden">
              <CardContent className="p-4">
                {samplesLoading && (
                  <div className="space-y-3">
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-16 w-full" />
                  </div>
                )}
                {!samplesLoading && samples.length === 0 && (
                  <div className="text-center py-12 text-muted-foreground">
                    <FlaskConical className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p>No samples in this sheet.</p>
                  </div>
                )}
                {!samplesLoading && samples.length > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {samples.map((s) => (
                      <div 
                        key={s.id} 
                        className="p-4 rounded-xl border border-border hover:border-primary/50 transition-colors group"
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <div className="p-2 rounded-lg bg-primary/10">
                              <FlaskConical className="w-4 h-4 text-primary" />
                            </div>
                            <span className="font-semibold">{s.name}</span>
                          </div>
                          <Button 
                            variant="ghost" 
                            size="icon-sm" 
                            onClick={() => handleDeleteSample(s.id)} 
                            className="text-destructive hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                        <div className="flex items-center gap-2 mt-3">
                          <span className="px-2.5 py-1 bg-secondary text-secondary-foreground rounded-md text-xs">
                            {s.group}
                          </span>
                          <span className="text-xs text-muted-foreground font-mono">
                            Rep {s.replicate}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}

function cn(...classes: (string | undefined | null | false)[]) {
  return classes.filter(Boolean).join(' ');
}
