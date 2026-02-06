'use client';

import { useState, useEffect } from 'react';

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
  files: any[]; // 简化处理，后端 SamplePublic 返回 files 列表
}

export default function SampleManager({ projectId }: { projectId: string }) {
  const [sheets, setSheets] = useState<SampleSheet[]>([]);
  const [activeSheetId, setActiveSheetId] = useState<string | null>(null);
  const [samples, setSamples] = useState<Sample[]>([]);
  
  // 文件选择相关
  const [availableFiles, setAvailableFiles] = useState<FileData[]>([]);
  
  // 表单状态
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

  // === 加载数据 ===
  
  // 1. 加载实验单列表
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

  // 2. 加载选中实验单的样本
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

  // 3. 加载项目所有文件 (用于下拉选择)
  const fetchFiles = async () => {
    try {
      const token = localStorage.getItem('token');
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
      // 使用 recursive=true 获取扁平化的文件列表
      const res = await fetch(`${apiUrl}/files/projects/${projectId}/files?recursive=true`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        // 只保留文件，过滤掉文件夹
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

  // === 操作 Handlers ===

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
        setNewSheetName('');
        setIsCreatingSheet(false);
        fetchSheets();
      }
    } catch (e) { alert('创建失败'); }
  };

  const handleAddSample = async () => {
    if (!activeSheetId || !newSample.name || !newSample.r1_file_id) {
      alert("请填写完整信息 (Sample Name 和 R1 File 是必填项)");
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
        setIsAddingSample(false);
        setNewSample({ name: '', group: 'control', replicate: 1, r1_file_id: '', r2_file_id: '' });
        fetchSamples(activeSheetId);
      } else {
        const err = await res.json();
        alert(`添加失败: ${err.detail}`);
      }
    } catch (e) { alert('网络错误'); }
  };

  const handleDeleteSample = async (sampleId: string) => {
    if(!confirm("确认删除该样本？")) return;
    try {
      const token = localStorage.getItem('token');
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
      await fetch(`${apiUrl}/workflow/samples/${sampleId}`, {
         method: 'DELETE',
         headers: { Authorization: `Bearer ${token}` }
      });
      if (activeSheetId) fetchSamples(activeSheetId);
    } catch (e) { alert('删除失败'); }
  };
  
  const handleDeleteSheet = async (sheetId: string) => {
      if(!confirm("确认删除实验单？这将同时删除其中定义的所有样本关联。")) return;
      try {
        const token = localStorage.getItem('token');
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
        await fetch(`${apiUrl}/workflow/sample_sheets/${sheetId}`, {
           method: 'DELETE',
           headers: { Authorization: `Bearer ${token}` }
        });
        if (activeSheetId === sheetId) setActiveSheetId(null);
        fetchSheets();
      } catch (e) { alert('删除失败'); }
  };

  return (
    <div className="flex h-[calc(70vh-200px)] gap-6">
      {/* 左侧：实验单列表 */}
      <div className="w-1/4 bg-gray-900 border border-gray-800 rounded-xl p-4 flex flex-col">
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
              placeholder="Sheet Name (e.g. RNA-Seq Batch 1)"
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
                  onClick={(e) => { e.stopPropagation(); handleDeleteSheet(sheet.id); }}
                  className="text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                  ×
              </button>
            </div>
          ))}
          {sheets.length === 0 && <div className="text-gray-600 text-sm text-center mt-10">暂无实验单</div>}
        </div>
      </div>

      {/* 右侧：样本列表 */}
      <div className="w-3/4 bg-gray-900 border border-gray-800 rounded-xl p-6 flex flex-col">
        {activeSheetId ? (
          <>
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

            {/* 添加样本表单 */}
            {isAddingSample && (
              <div className="bg-gray-800/50 border border-gray-700 p-4 rounded-lg mb-6 animate-in fade-in slide-in-from-top-2">
                <h4 className="font-bold text-sm mb-3 text-blue-400">New Sample Definition</h4>
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Sample Name</label>
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
                    <label className="block text-xs text-gray-400 mb-1">Replicate</label>
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
                  <button onClick={handleAddSample} className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-1.5 rounded text-sm">Save Sample</button>
                </div>
              </div>
            )}

            {/* 样本列表表格 */}
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
                        {/* 这里后端目前还没把 filename 带出来，只带了 files 关联，可能需要优化 SamplePublic 返回详细 file info */}
                        {/* 临时展示文件数量 */}
                        {sample.files ? `${sample.files.length} Files Linked` : 'No Files'}
                      </td>
                      <td className="px-4 py-3 text-right">
                         <button onClick={() => handleDeleteSample(sample.id)} className="text-red-500 hover:text-red-400">Delete</button>
                      </td>
                    </tr>
                  ))}
                  {samples.length === 0 && (
                    <tr><td colSpan={5} className="p-8 text-center text-gray-500">No samples defined yet.</td></tr>
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