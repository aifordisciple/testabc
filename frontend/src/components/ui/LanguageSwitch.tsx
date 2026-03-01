'use client';

import { Globe, Check } from 'lucide-react';
import { useLocale, type Locale } from '@/stores/localeStore';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const languages: { code: Locale; label: string; nativeLabel: string }[] = [
  { code: 'zh', label: 'Chinese', nativeLabel: '中文' },
  { code: 'en', label: 'English', nativeLabel: 'English' },
];

interface LanguageSwitchProps {
  compact?: boolean;
}

export function LanguageSwitch({ compact = false }: LanguageSwitchProps) {
  const { locale, setLocale } = useLocale();
  const currentLang = languages.find(l => l.code === locale) || languages[0];

  if (compact) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" title={`语言: ${currentLang.nativeLabel}`}>
            <Globe className="w-5 h-5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {languages.map((lang) => (
            <DropdownMenuItem
              key={lang.code}
              onClick={() => setLocale(lang.code)}
              className="flex items-center gap-2"
            >
              {locale === lang.code ? (
                <Check className="w-4 h-4 text-primary" />
              ) : (
                <span className="w-4 h-4" />
              )}
              <span>{lang.nativeLabel}</span>
              <span className="text-xs text-muted-foreground">({lang.label})</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="flex items-center gap-2">
          <Globe className="w-4 h-4" />
          <span>{currentLang.nativeLabel}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {languages.map((lang) => (
          <DropdownMenuItem
            key={lang.code}
            onClick={() => setLocale(lang.code)}
            className="flex items-center gap-2"
          >
            {locale === lang.code ? (
              <Check className="w-4 h-4 text-primary" />
            ) : (
              <span className="w-4 h-4" />
            )}
            <span>{lang.nativeLabel}</span>
            <span className="text-xs text-muted-foreground">({lang.label})</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
