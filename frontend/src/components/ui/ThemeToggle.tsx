'use client';

import { useTheme } from '@/stores/themeStore';
import { Sun, Moon, Monitor, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useLocale } from '@/stores/localeStore';

type Theme = 'light' | 'dark' | 'system';

const getThemeLabels = (locale: 'zh' | 'en') => ({
  light: locale === 'en' ? 'Light' : '浅色',
  dark: locale === 'en' ? 'Dark' : '深色',
  system: locale === 'en' ? 'System' : '跟随系统',
});

const themes: { value: Theme; icon: React.ReactNode }[] = [
  { value: 'light', icon: <Sun className="w-4 h-4" /> },
  { value: 'dark', icon: <Moon className="w-4 h-4" /> },
  { value: 'system', icon: <Monitor className="w-4 h-4" /> },
];

interface ThemeToggleProps {
  className?: string;
}

export function ThemeToggle({ className = '' }: ThemeToggleProps) {
  const { theme, setTheme } = useTheme();
  const { locale } = useLocale();
  const labels = getThemeLabels(locale);
  
  const currentTheme = themes.find((t) => t.value === theme) || themes[2];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className={`flex items-center gap-2 ${className}`}
        >
          {currentTheme.icon}
          <span className="hidden sm:inline">{labels[theme]}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {themes.map((t) => (
          <DropdownMenuItem
            key={t.value}
            onClick={() => setTheme(t.value)}
            className="flex items-center gap-2"
          >
            {theme === t.value ? (
              <Check className="w-4 h-4 text-primary" />
            ) : (
              <span className="w-4 h-4" />
            )}
            <span className="flex items-center gap-2">
              {t.icon}
              {labels[t.value]}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function ThemeToggleCompact({ className = '' }: ThemeToggleProps) {
  const { theme, setTheme } = useTheme();
  const { locale } = useLocale();
  const labels = getThemeLabels(locale);
  
  const cycleTheme = () => {
    const order: Theme[] = ['light', 'dark', 'system'];
    const currentIndex = order.indexOf(theme);
    const nextIndex = (currentIndex + 1) % order.length;
    setTheme(order[nextIndex]);
  };

  const currentTheme = themes.find((t) => t.value === theme) || themes[2];

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={cycleTheme}
      className={className}
      title={`${labels[theme]} (点击切换)`}
    >
      {currentTheme.icon}
    </Button>
  );
}
