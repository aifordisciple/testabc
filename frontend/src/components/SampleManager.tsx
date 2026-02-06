'use client';

import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import ConfirmModal from './ConfirmModal'; // 👈 引入

// ... 保持原有 interface 定义不变 ...
interface FileData {
  id: string;
  filename: string;
  is_directory: boolean;
}

interface SampleSheet {
  id: string;
  name: string;
  description: string;
  created_at: string;
}

interface Sample {
  id: string;
  name: string;
  group: string;
  replicate: number;
  files: any[];
}

export default function SampleManager({ projectId }: { projectId: string }) {
  const [sheets, setSheets] = useState<SampleSheet[]>([]);
  const [activeSheetId, setActiveSheetId] = useState<string | null>(null);
  const [samples, setSamples] = useState<Sample[]>([]);
  const [availableFiles, setAvailableFiles] = useState<FileData[]>([]);
  
  const [isCreatingSheet, setIsCreatingSheet] = useState(false);
  const [newSheetName, setNewSheetName] = useState('');
  
  const [isAddingSample, setIsAddingSample] = useState(false);
  const [newSample, setNewSample] = useState({
    name: '',
    group: 'control',
    replicate: 1,
    r1_file_id: '',
    r2_file_id: ''
  });

  // 👇 新增状态：控制确认弹窗
  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    action: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    action: () => {},
  });

  // ... 保持 fetchSheets, fetchSamples, fetchFiles, useEffect, handleCreateSheet, handleAddSample 不变 ...
  const fetchSheets = async () => {
    try {
      const token = localStorage.getItem('token');
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
      const res = await fetch(`${apiUrl}/workflow/projects/${projectId}/sample_sheets`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) setSheets(await res.json());
    } catch (e) { console.error(e); }
  };

  const fetchSamples = async (sheetId: string) => {
    try {
      const token = localStorage.getItem('token');
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
      const res = await fetch(`${apiUrl}/workflow/sample_sheets/${sheetId}/samples`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) setSamples(await res.json());
    } catch (e) { console.error(e); }
  };

  const fetchFiles = async () => {
    try {
      const token = localStorage.getItem('token');
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
      const res = await fetch(`${apiUrl}/files/projects/${projectId}/files?recursive=true`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setAvailableFiles(data.files.filter((f: FileData) => !f.is_directory));
      }
    } catch (e) { console.error(e); }
  };

  useEffect(() => {
    fetchSheets();
    fetchFiles();
  }, [projectId]);

  useEffect(() => {
    if (activeSheetId) {
      fetchSamples(activeSheetId);
    } else {
      setSamples([]);
    }
  }, [activeSheetId]);

  const handleCreateSheet = async () => {
    if (!newSheetName) return;
    try {
      const token = localStorage.getItem('token');
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
      const res = await fetch(`${apiUrl}/workflow/projects/${projectId}/sample_sheets`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({ name: newSheetName, project_id: projectId })
      });
      if (res.ok) {
        toast.success("Sample sheet created");
        setNewSheetName('');
        setIsCreatingSheet(false);
        fetchSheets();
      }
    } catch (e) { toast.error('Creation failed'); }
  };

  const handleAddSample = async () => {
    if (!activeSheetId || !newSample.name || !newSample.r1_file_id) {
      toast.error("Please fill Name and select R1 File");
      return;
    }
    try {
      const token = localStorage.getItem('token');
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
      
      const payload: any = {
        name: newSample.name,
        group: newSample.group,
        replicate: Number(newSample.replicate),
        sample_sheet_id: activeSheetId,
        r1_file_id: newSample.r1_file_id
      };
      if (newSample.r2_file_id) payload.r2_file_id = newSample.r2_file_id;

      const res = await fetch(`${apiUrl}/workflow/sample_sheets/${activeSheetId}/samples`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        toast.success("Sample added");
        setIsAddingSample(false);
        setNewSample({ name: '', group: 'control', replicate: 1, r1_file_id: '', r2_file_id: '' });
        fetchSamples(activeSheetId);
      } else {
        const err = await res.json();
        toast.error(`Error: ${err.detail}`);
      }
    } catch (e) { toast.error('Network error'); }
  };

  // 👇 修改：Trigger Confirm Modal
  const confirmDeleteSample = (sampleId: string) => {
    setConfirmState({
      isOpen: true,
      title: "Delete Sample",
      message: "Are you sure you want to delete this sample? This cannot be undone.",
      action: () => deleteSample(sampleId)
    });
  };

  const deleteSample = async (sampleId: string) => {
    try {
      const token = localStorage.getItem('token');
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
      const res = await fetch(`${apiUrl}/workflow/samples/${sampleId}`, {
         method: 'DELETE',
         headers: { Authorization: `Bearer ${token}` }
      });
      if(res.ok) {
          toast.success("Sample deleted");
          if (activeSheetId) fetchSamples(activeSheetId);
      }
    } catch (e) { toast.error('Delete failed'); }
  };
  
  // 👇 修改：Trigger Confirm Modal
  const confirmDeleteSheet = (sheetId: string) => {
    setConfirmState({
      isOpen: true,
      title: "Delete Sample Sheet",
      message: "Are you sure you want to delete this sheet? All samples defined in it will also be deleted.",
      action: () => deleteSheet(sheetId)
    });
  };

  const deleteSheet = async (sheetId: string) => {
      try {
        const token = localStorage.getItem('token');
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
        const res = await fetch(`${apiUrl}/workflow/sample_sheets/${sheetId}`, {
           method: 'DELETE',
           headers: { Authorization: `Bearer ${token}` }
        });
        if(res.ok) {
            toast.success("Sheet deleted");
            if (activeSheetId === sheetId) setActiveSheetId(null);
            fetchSheets();
        }
      } catch (e) { toast.error('Delete failed'); }
  };

  return (
    <div className="flex h-[calc(100vh-200px)] gap-6">
      {/* 👈 插入 ConfirmModal */}
      <ConfirmModal 
        isOpen={confirmState.isOpen}
        title={confirmState.title}
        message={confirmState.message}
        onClose={() => setConfirmState(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmState.action}
      />

      {/* 左侧：实验单列表 */}
      <div className="w-1/4 bg-gray-900 border border-gray-800 rounded-xl p-4 flex flex-col">
        {/* ... 保持不变 ... */}
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-bold text-lg">Sample Sheets</h3>
          <button 
            onClick={() => setIsCreatingSheet(true)}
            className="text-emerald-400 hover:text-emerald-300 text-sm"
          >
            + New
          </button>
        </div>
        
        {isCreatingSheet && (
          <div className="mb-4 bg-gray-800 p-3 rounded-lg">
            <input 
              className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm mb-2 text-white"
              placeholder="Sheet Name"
              value={newSheetName}
              onChange={e => setNewSheetName(e.target.value)}
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setIsCreatingSheet(false)} className="text-xs text-gray-400">Cancel</button>
              <button onClick={handleCreateSheet} className="text-xs text-emerald-400 font-bold">Create</button>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto space-y-2">
          {sheets.map(sheet => (
            <div 
              key={sheet.id}
              onClick={() => setActiveSheetId(sheet.id)}
              className={`p-3 rounded-lg cursor-pointer transition-colors flex justify-between group ${
                activeSheetId === sheet.id ? 'bg-emerald-900/30 border border-emerald-500/50' : 'bg-gray-800/50 hover:bg-gray-800'
              }`}
            >
              <div>
                <div className="font-medium text-sm">{sheet.name}</div>
                <div className="text-xs text-gray-500">{new Date(sheet.created_at).toLocaleDateString()}</div>
              </div>
              <button 
                  onClick={(e) => { e.stopPropagation(); confirmDeleteSheet(sheet.id); }} // 👈 修改调用
                  className="text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                  ×
              </button>
            </div>
          ))}
          {sheets.length === 0 && <div className="text-gray-600 text-sm text-center mt-10">No sheets</div>}
        </div>
      </div>

      {/* 右侧：样本列表 */}
      <div className="w-3/4 bg-gray-900 border border-gray-800 rounded-xl p-6 flex flex-col">
        {activeSheetId ? (
          <>
            {/* ... 保持不变 ... */}
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-bold text-xl">
                 Samples 
                 <span className="ml-2 text-sm font-normal text-gray-500">
                   in {sheets.find(s => s.id === activeSheetId)?.name}
                 </span>
              </h3>
              <button 
                onClick={() => setIsAddingSample(true)}
                className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm transition-colors"
              >
                + Add Sample
              </button>
            </div>

            {isAddingSample && (
              // ... Add Form (保持不变) ...
              <div className="bg-gray-800/50 border border-gray-700 p-4 rounded-lg mb-6 animate-in fade-in slide-in-from-top-2">
                <h4 className="font-bold text-sm mb-3 text-blue-400">New Sample Definition</h4>
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Name</label>
                    <input 
                      className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-sm text-white"
                      value={newSample.name}
                      onChange={e => setNewSample({...newSample, name: e.target.value})}
                      placeholder="e.g. Control_Rep1"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Group</label>
                    <input 
                      className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-sm text-white"
                      value={newSample.group}
                      onChange={e => setNewSample({...newSample, group: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Rep</label>
                    <input 
                      type="number"
                      className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-sm text-white"
                      value={newSample.replicate}
                      onChange={e => setNewSample({...newSample, replicate: Number(e.target.value)})}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">R1 File (Required)</label>
                    <select 
                      className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-sm text-white"
                      value={newSample.r1_file_id}
                      onChange={e => setNewSample({...newSample, r1_file_id: e.target.value})}
                    >
                      <option value="">-- Select File --</option>
                      {availableFiles.map(f => (
                        <option key={f.id} value={f.id}>{f.filename}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">R2 File (Optional)</label>
                    <select 
                      className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-sm text-white"
                      value={newSample.r2_file_id}
                      onChange={e => setNewSample({...newSample, r2_file_id: e.target.value})}
                    >
                      <option value="">-- Select File --</option>
                      {availableFiles.map(f => (
                        <option key={f.id} value={f.id}>{f.filename}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex justify-end gap-3">
                  <button onClick={() => setIsAddingSample(false)} className="px-3 py-1 text-sm text-gray-400">Cancel</button>
                  <button onClick={handleAddSample} className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-1.5 rounded text-sm">Save</button>
                </div>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-800 text-gray-400">
                  <tr>
                    <th className="px-4 py-2">Name</th>
                    <th className="px-4 py-2">Group</th>
                    <th className="px-4 py-2">Rep</th>
                    <th className="px-4 py-2">Files</th>
                    <th className="px-4 py-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {samples.map(sample => (
                    <tr key={sample.id} className="hover:bg-gray-800/30">
                      <td className="px-4 py-3 font-medium text-white">{sample.name}</td>
                      <td className="px-4 py-3 text-gray-400">{sample.group}</td>
                      <td className="px-4 py-3 text-gray-400">{sample.replicate}</td>
                      <td className="px-4 py-3 text-gray-500">
                        {sample.files ? `${sample.files.length} Files Linked` : 'No Files'}
                      </td>
                      <td className="px-4 py-3 text-right">
                         <button onClick={() => confirmDeleteSample(sample.id)} className="text-red-500 hover:text-red-400">Delete</button> {/* 👈 修改调用 */}
                      </td>
                    </tr>
                  ))}
                  {samples.length === 0 && (
                    <tr><td colSpan={5} className="p-8 text-center text-gray-500">No samples defined.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <svg className="w-16 h-16 mb-4 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>
            <p>Select a Sample Sheet on the left to manage samples.</p>
          </div>
        )}
      </div>
    </div>
  );
}