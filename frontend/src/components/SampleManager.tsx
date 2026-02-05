'use client';

import { useState, useEffect } from 'react';

// === 类型定义 ===
interface FileData {
  id: string;
  filename: string;
}

interface Sample {
  id: string;
  name: string;
  group: string;
  replicate: number;
  files: FileData[];
}

interface SampleManagerProps {
  projectId: string;
}

export default function SampleManager({ projectId }: SampleManagerProps) {
  const [samples, setSamples] = useState<Sample[]>([]);
  const [files, setFiles] = useState<FileData[]>([]); // 用于创建样本时的下拉选择
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  // === 表单状态 ===
  const [form, setForm] = useState({
    name: '',
    group: 'control', // 默认分组
    replicate: 1,
    r1_file_id: '',
    r2_file_id: ''
  });

// === 初始化加载 ===
  const fetchData = async () => {
    try {
      const token = localStorage.getItem('token');
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      const headers = { Authorization: `Bearer ${token}` };

      // 并行加载：样本列表 + 文件列表 (增加 ?recursive=true 参数)
      const [resSamples, resFiles] = await Promise.all([
        fetch(`${apiUrl}/workflow/projects/${projectId}/samples`, { headers }),
        // 👇 修改这里：加上 recursive=true
        fetch(`${apiUrl}/files/projects/${projectId}/files?recursive=true`, { headers }) 
      ]);

      if (resSamples.ok) setSamples(await resSamples.json());
      
      if (resFiles.ok) {
        const fileData = await resFiles.json();
        const list = Array.isArray(fileData) ? fileData : fileData.files || [];
        // 这里的 list 已经是项目下所有的文件了
        setFiles(list);
      }

    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [projectId]);

  // === 提交创建 ===
  const handleCreate = async () => {
    if (!form.name || !form.r1_file_id) return alert('Sample Name and R1 File are required');
    
    try {
      const token = localStorage.getItem('token');
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      
      // 构造 payload
      const payload: any = {
        name: form.name,
        group: form.group,
        replicate: Number(form.replicate),
        project_id: projectId,
        r1_file_id: form.r1_file_id,
        meta_json: "{}"
      };
      if (form.r2_file_id) payload.r2_file_id = form.r2_file_id;

      const res = await fetch(`${apiUrl}/workflow/projects/${projectId}/samples`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        setShowModal(false);
        setForm({ name: '', group: 'control', replicate: 1, r1_file_id: '', r2_file_id: '' });
        fetchData(); // 刷新列表
      } else {
        const err = await res.json();
        alert(`Failed: ${err.detail}`);
      }
    } catch (e) {
      alert('Network error');
    }
  };

  // === 删除样本 ===
  const handleDelete = async (sampleId: string) => {
    if(!confirm("Delete this sample?")) return;
    const token = localStorage.getItem('token');
    await fetch(`${process.env.NEXT_PUBLIC_API_URL}/workflow/samples/${sampleId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
    });
    fetchData();
  };

  if (loading) return <div className="text-gray-500">Loading samples...</div>;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-xl font-bold text-white">Samples ({samples.length})</h3>
        <button 
          onClick={() => setShowModal(true)}
          className="bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          + Add Sample
        </button>
      </div>

      {/* 样本列表 */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-gray-800/50 text-gray-400 text-xs uppercase">
            <tr>
              <th className="px-6 py-3">Sample Name</th>
              <th className="px-6 py-3">Group</th>
              <th className="px-6 py-3">R1 File</th>
              <th className="px-6 py-3">R2 File</th>
              <th className="px-6 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800 text-sm">
            {samples.length === 0 && (
                <tr><td colSpan={5} className="p-6 text-center text-gray-500">No samples yet.</td></tr>
            )}
            {samples.map((s) => {
                // 简单的查找 R1/R2 文件名
                // 后端返回的 s.files 是一个数组，我们需要按 role 或者顺序区分
                // 由于 SamplePublic 里的 files 列表没有直接带 role 字段(在 Link 表里)，
                // 这里为了简单展示，我们假设 files[0] 是 R1, files[1] 是 R2 (或者看后端返回顺序)
                // 严谨的做法是后端 SamplePublic 应该包含 "r1_file: File, r2_file: File" 字段。
                // 暂时我们在前端直接展示所有关联文件
                const fileNames = s.files.map(f => f.filename).join(', ');
                
                return (
                    <tr key={s.id} className="hover:bg-gray-800/30 text-gray-300">
                        <td className="px-6 py-4 font-medium text-white">{s.name}</td>
                        <td className="px-6 py-4">
                            <span className={`px-2 py-1 rounded text-xs ${s.group === 'control' ? 'bg-gray-700 text-gray-300' : 'bg-orange-900/50 text-orange-300'}`}>
                                {s.group}
                            </span>
                        </td>
                        <td className="px-6 py-4 truncate max-w-[200px]" title={fileNames}>{s.files[0]?.filename || '-'}</td>
                        <td className="px-6 py-4 truncate max-w-[200px]">{s.files[1]?.filename || '-'}</td>
                        <td className="px-6 py-4 text-right">
                            <button onClick={() => handleDelete(s.id)} className="text-red-500 hover:text-red-400">Delete</button>
                        </td>
                    </tr>
                );
            })}
          </tbody>
        </table>
      </div>

      {/* 创建弹窗 */}
      {showModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
          <div className="bg-gray-900 p-6 rounded-xl border border-gray-700 w-[500px] shadow-2xl">
            <h3 className="text-xl font-bold text-white mb-4">New Sample</h3>
            
            <div className="space-y-4">
                <div>
                    <label className="block text-xs text-gray-400 mb-1">Sample Name</label>
                    <input 
                        className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white text-sm"
                        placeholder="e.g. Sample_01"
                        value={form.name}
                        onChange={e => setForm({...form, name: e.target.value})}
                    />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs text-gray-400 mb-1">Group</label>
                        <select 
                            className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white text-sm"
                            value={form.group}
                            onChange={e => setForm({...form, group: e.target.value})}
                        >
                            <option value="control">Control</option>
                            <option value="treatment">Treatment</option>
                            <option value="tumor">Tumor</option>
                            <option value="normal">Normal</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs text-gray-400 mb-1">Replicate</label>
                        <input 
                            type="number"
                            className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white text-sm"
                            value={form.replicate}
                            onChange={e => setForm({...form, replicate: Number(e.target.value)})}
                        />
                    </div>
                </div>

                <div>
                    <label className="block text-xs text-gray-400 mb-1">R1 File (Required)</label>
                    <select 
                        className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white text-sm"
                        value={form.r1_file_id}
                        onChange={e => setForm({...form, r1_file_id: e.target.value})}
                    >
                        <option value="">-- Select File --</option>
                        {files.map(f => <option key={f.id} value={f.id}>{f.filename}</option>)}
                    </select>
                </div>

                <div>
                    <label className="block text-xs text-gray-400 mb-1">R2 File (Optional)</label>
                    <select 
                        className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white text-sm"
                        value={form.r2_file_id}
                        onChange={e => setForm({...form, r2_file_id: e.target.value})}
                    >
                        <option value="">-- None --</option>
                        {files.map(f => <option key={f.id} value={f.id}>{f.filename}</option>)}
                    </select>
                </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-white">Cancel</button>
              <button onClick={handleCreate} className="bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded-lg text-sm">Create</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}