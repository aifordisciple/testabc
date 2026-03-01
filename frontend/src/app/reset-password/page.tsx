'use client';
import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/Card';
import { Loader2, Sparkles, ArrowLeft, Lock } from 'lucide-react';

function ResetForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) {
      setError('Token missing');
      return;
    }
    setLoading(true);
    setError('');

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      const res = await fetch(`${apiUrl}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, new_password: password }),
      });

      if (res.ok) {
        setSuccess(true);
      } else {
        setError('重置失败，链接可能已过期');
      }
    } catch (e) {
      setError('网络错误');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <Card className="relative w-full max-w-md">
        <CardContent className="p-8 text-center">
          <div className="flex justify-center mb-4">
            <div className="p-4 rounded-full bg-emerald-500/20">
              <Lock className="w-10 h-10 text-emerald-500" />
            </div>
          </div>
          <h2 className="text-2xl font-bold mb-2">Password Reset!</h2>
          <p className="text-muted-foreground mb-6">
            密码重置成功，请使用新密码登录
          </p>
          <Button onClick={() => router.push('/')} className="gap-2">
            <ArrowLeft className="w-4 h-4" />
            立即登录
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="relative w-full max-w-md">
      <CardContent className="p-8">
        <h1 className="text-2xl font-bold mb-6">Set New Password</h1>
        <form onSubmit={handleReset} className="space-y-6">
          {error && (
            <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 text-sm text-destructive text-center">
              {error}
            </div>
          )}
          <div>
            <label className="block text-sm font-medium mb-2">New Password</label>
            <Input
              type="password"
              minLength={8}
              placeholder="Min 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <Button type="submit" disabled={loading} className="w-full h-11">
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Reset Password
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
  );
}

export default function ResetPasswordPage() {
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
          <h1 className="text-2xl font-bold">Autonome</h1>
          <p className="mt-2 text-muted-foreground text-sm">
            Reset your password
          </p>
        </div>

        <Suspense fallback={
          <Card className="relative w-full max-w-md">
            <CardContent className="p-8 text-center">
              <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
              <p className="mt-4 text-muted-foreground">Loading...</p>
            </CardContent>
          </Card>
        }>
          <ResetForm />
        </Suspense>
      </div>
    </main>
  );
}
