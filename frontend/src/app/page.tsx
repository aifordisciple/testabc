'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/Card';
import { Loader2, Sparkles } from 'lucide-react';

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
      const formData = new URLSearchParams();
      formData.append('username', email); 
      formData.append('password', password);

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

      localStorage.setItem('token', data.access_token);
      router.push('/copilot'); 
      
    } catch (err: any) {
      setError(err.message || '服务器连接失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/20 via-background to-background" />
      
      <div className="relative w-full max-w-md space-y-8">
        <div className="text-center">
          <div className="flex justify-center mb-4">
            <div className="p-4 rounded-2xl bg-primary/20">
              <Sparkles className="w-10 h-10 text-primary" />
            </div>
          </div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-primary to-emerald-500 text-transparent bg-clip-text">
            Autonome
          </h1>
          <p className="mt-2 text-muted-foreground text-sm">
            AI 生信分析平台
          </p>
        </div>

        <Card className="relative">
          <CardContent className="p-8">
            <form className="space-y-6" onSubmit={handleLogin}>
              {error && (
                <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 text-sm text-destructive text-center">
                  {error}
                </div>
              )}

              <div>
                <label htmlFor="email" className="block text-sm font-medium mb-2">
                  Email
                </label>
                <Input
                  id="email"
                  type="email"
                  placeholder="researcher@lab.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium mb-2">
                  Password
                </label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>

              <Button type="submit" disabled={loading} className="w-full h-11">
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Sign in to Console
              </Button>
            </form>
            
            <div className="mt-6 flex justify-between text-sm">
              <Link href="/register" className="text-muted-foreground hover:text-foreground transition-colors">
                没有账号？注册
              </Link>
              <Link href="/forgot-password" className="text-muted-foreground hover:text-foreground transition-colors">
                忘记密码？
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
