'use client';

import { useTheme } from '@/stores/themeStore';
import { useLocale } from '@/stores/localeStore';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { Settings, Moon, Sun, Monitor } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function SettingsPage() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const { locale, setLocale } = useLocale();
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <Settings className="w-6 h-6" />
          <h1 className="text-2xl font-bold">设置 / Settings</h1>
        </div>

        <div className="space-y-6">
          {/* Theme Section */}
          <div className="bg-card border rounded-lg p-6">
            <h2 className="text-lg font-semibold mb-4">主题 / Theme</h2>
            <div className="flex gap-3">
              <Button
                variant={theme === 'light' ? 'default' : 'outline'}
                onClick={() => setTheme('light')}
                className="gap-2"
              >
                <Sun className="w-4 h-4" />
                浅色 / Light
              </Button>
              <Button
                variant={theme === 'dark' ? 'default' : 'outline'}
                onClick={() => setTheme('dark')}
                className="gap-2"
              >
                <Moon className="w-4 h-4" />
                深色 / Dark
              </Button>
              <Button
                variant={theme === 'system' ? 'default' : 'outline'}
                onClick={() => setTheme('system')}
                className="gap-2"
              >
                <Monitor className="w-4 h-4" />
                跟随系统 / System
              </Button>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              当前: {resolvedTheme === 'dark' ? '深色模式' : '浅色模式'} / Current: {resolvedTheme === 'dark' ? 'Dark' : 'Light'} mode
            </p>
          </div>

          {/* Language Section */}
          <div className="bg-card border rounded-lg p-6">
            <h2 className="text-lg font-semibold mb-4">语言 / Language</h2>
            <div className="flex gap-3">
              <Button
                variant={locale === 'zh' ? 'default' : 'outline'}
                onClick={() => setLocale('zh')}
              >
                中文
              </Button>
              <Button
                variant={locale === 'en' ? 'default' : 'outline'}
                onClick={() => setLocale('en')}
              >
                English
              </Button>
            </div>
          </div>

          {/* Navigation */}
          <div className="bg-card border rounded-lg p-6">
            <h2 className="text-lg font-semibold mb-4">快速链接 / Quick Links</h2>
            <div className="space-y-2">
              <Link href="/copilot" className="block p-3 rounded-lg border hover:bg-accent">
                Copilot 智能助手
              </Link>
              <Link href="/dashboard" className="block p-3 rounded-lg border hover:bg-accent">
                工作台 Dashboard
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
