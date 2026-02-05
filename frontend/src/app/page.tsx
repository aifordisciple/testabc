'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // 1. 构造表单数据 (FastAPI OAuth2 要求 x-www-form-urlencoded)
      // 注意：字段名必须是 'username' 和 'password'
      const formData = new URLSearchParams();
      formData.append('username', email); 
      formData.append('password', password);

      // 2. 发送请求
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      const res = await fetch(`${apiUrl}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.detail || '登录失败');
      }

      // 3. 登录成功：存储 Token
      localStorage.setItem('token', data.access_token);
      console.log('Login Success:', data);

      // 4. 跳转到控制台
      router.push('/dashboard'); 
      
    } catch (err: any) {
      console.error(err);
      setError(err.message || '服务器连接失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gray-950 text-white p-4">
      <div className="w-full max-w-md space-y-8">
        {/* Logo 区 */}
        <div className="text-center">
          <h1 className="text-5xl font-bold tracking-tighter bg-gradient-to-r from-blue-400 to-emerald-400 text-transparent bg-clip-text">
            Autonome
          </h1>
          <h2 className="mt-2 text-gray-400 text-sm tracking-widest uppercase">
            元律 · AI 生信分析平台
          </h2>
        </div>

        {/* 登录表单 */}
        <div className="bg-gray-900/50 border border-gray-800 p-8 rounded-xl shadow-2xl backdrop-blur-sm">
          <form className="space-y-6" onSubmit={handleLogin}>
            
            {/* 错误提示条 */}
            {error && (
              <div className="bg-red-500/10 border border-red-500/50 rounded-md p-3 text-sm text-red-400 text-center">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-300">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                className="mt-2 block w-full rounded-md border-0 bg-gray-800 py-2.5 px-3 text-white shadow-sm ring-1 ring-inset ring-gray-700 placeholder:text-gray-500 focus:ring-2 focus:ring-inset focus:ring-blue-500 sm:text-sm sm:leading-6"
                placeholder="researcher@lab.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-300">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                className="mt-2 block w-full rounded-md border-0 bg-gray-800 py-2.5 px-3 text-white shadow-sm ring-1 ring-inset ring-gray-700 placeholder:text-gray-500 focus:ring-2 focus:ring-inset focus:ring-blue-500 sm:text-sm sm:leading-6"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <div>
              <button
                type="submit"
                disabled={loading}
                className="flex w-full justify-center rounded-md bg-blue-600 px-3 py-2.5 text-sm font-semibold leading-6 text-white shadow-sm hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {loading ? '正在接入神经元网络...' : 'Sign in to Console'}
              </button>
            </div>
          </form>
          
          {/* 底部链接区：注册 & 忘记密码 */}
          <div className="mt-6 flex justify-between text-sm items-center">
            <div className="flex items-center gap-1">
               <span className="text-gray-500">没有账号？</span>
               <Link href="/register" className="font-semibold text-blue-400 hover:text-blue-300">
                 注册新账号
               </Link>
            </div>
            
            <Link href="/forgot-password" className="text-gray-500 hover:text-gray-300">
              忘记密码？
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}