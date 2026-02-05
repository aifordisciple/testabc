'use client';
import { useState } from 'react';
import Link from 'next/link';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('loading');
    
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      // 注意：这里是 POST /password-recovery/{email}
      const res = await fetch(`${apiUrl}/auth/password-recovery/${email}`, {
        method: 'POST',
      });
      
      if (res.ok) {
        setStatus('success');
      } else {
        setStatus('error');
      }
    } catch (e) {
      setStatus('error');
    }
  };

  if (status === 'success') {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-gray-950 text-white p-4">
        <div className="w-full max-w-md bg-gray-900 border border-gray-800 p-8 rounded-xl text-center">
          <h2 className="text-2xl font-bold text-emerald-400 mb-4">Email Sent!</h2>
          <p className="text-gray-300 mb-6">
            请检查你的后端控制台 (Terminal) 获取重置链接。<br/>
            (生产环境会发送至: {email})
          </p>
          <Link href="/" className="text-blue-400 hover:text-blue-300">返回登录</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gray-950 text-white p-4">
      <div className="w-full max-w-md bg-gray-900 border border-gray-800 p-8 rounded-xl">
        <h1 className="text-2xl font-bold mb-6">Reset Password</h1>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-300">Enter your email</label>
            <input
              type="email"
              required
              className="mt-2 block w-full rounded-md bg-gray-800 border-0 py-2.5 px-3 text-white ring-1 ring-inset ring-gray-700 focus:ring-2 focus:ring-blue-500"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <button
            type="submit"
            disabled={status === 'loading'}
            className="w-full rounded-md bg-blue-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
          >
            {status === 'loading' ? 'Sending...' : 'Send Reset Link'}
          </button>
        </form>
        <div className="mt-4 text-center">
          <Link href="/" className="text-sm text-gray-500 hover:text-gray-300">Back to Login</Link>
        </div>
      </div>
    </main>
  );
}