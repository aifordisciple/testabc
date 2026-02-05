'use client';
import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

// 必须把使用 useSearchParams 的组件包在 Suspense 里
function ResetForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return alert('Token missing');
    setLoading(true);

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      const res = await fetch(`${apiUrl}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, new_password: password }),
      });

      if (res.ok) {
        alert('密码重置成功！请使用新密码登录。');
        router.push('/');
      } else {
        alert('重置失败，链接可能已过期。');
      }
    } catch (e) {
      alert('网络错误');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md bg-gray-900 border border-gray-800 p-8 rounded-xl">
      <h1 className="text-2xl font-bold mb-6">Set New Password</h1>
      <form onSubmit={handleReset} className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-300">New Password</label>
          <input
            type="password"
            required
            minLength={8}
            className="mt-2 block w-full rounded-md bg-gray-800 border-0 py-2.5 px-3 text-white ring-1 ring-inset ring-gray-700 focus:ring-2 focus:ring-blue-500"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-emerald-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          {loading ? 'Resetting...' : 'Confirm New Password'}
        </button>
      </form>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gray-950 text-white p-4">
      <Suspense fallback={<div>Loading...</div>}>
        <ResetForm />
      </Suspense>
    </main>
  );
}