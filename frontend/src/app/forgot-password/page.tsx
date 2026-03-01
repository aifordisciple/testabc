'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/Card';
import { Loader2, Sparkles, ArrowLeft, MailCheck } from 'lucide-react';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('loading');
    setErrorMsg('');
    
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      const res = await fetch(`${apiUrl}/auth/password-recovery/${email}`, {
        method: 'POST',
      });
      
      if (res.ok) {
        setStatus('success');
      } else {
        setStatus('error');
        setErrorMsg('发送失败，请稍后重试');
      }
    } catch (e) {
      setStatus('error');
      setErrorMsg('网络错误');
    }
  };

  if (status === 'success') {
    return (
      <main className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/20 via-background to-background" />
        
        <Card className="relative w-full max-w-md">
          <CardContent className="p-8 text-center">
            <div className="flex justify-center mb-4">
              <div className="p-4 rounded-full bg-emerald-500/20">
                <MailCheck className="w-10 h-10 text-emerald-500" />
              </div>
            </div>
            <h2 className="text-2xl font-bold mb-2">Email Sent!</h2>
            <p className="text-muted-foreground mb-6">
              请检查你的邮箱获取重置链接。<br/>
              <span className="text-sm">发送至: {email}</span>
            </p>
            <Button asChild>
              <Link href="/" className="gap-2">
                <ArrowLeft className="w-4 h-4" />
                返回登录
              </Link>
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

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
          <h1 className="text-2xl font-bold">Reset Password</h1>
          <p className="mt-2 text-muted-foreground text-sm">
            输入你的邮箱地址 we'll send you a reset link
          </p>
        </div>

        <Card className="relative">
          <CardContent className="p-8">
            <form onSubmit={handleSubmit} className="space-y-6">
              {status === 'error' && (
                <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 text-sm text-destructive text-center">
                  {errorMsg}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium mb-2">Email</label>
                <Input
                  type="email"
                  placeholder="researcher@lab.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <Button type="submit" disabled={status === 'loading'} className="w-full h-11">
                {status === 'loading' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Send Reset Link
              </Button>
            </form>
            
            <div className="mt-6 text-center">
              <Link href="/" className="text-sm text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-2">
                <ArrowLeft className="w-4 h-4" />
                Back to Login
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
