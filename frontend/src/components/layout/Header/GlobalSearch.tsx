'use client';

import { Search, Command } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';

interface GlobalSearchProps {
  placeholder?: string;
  className?: string;
}

interface SearchResult {
  id: string;
  title: string;
  type: 'project' | 'workflow' | 'file';
  href: string;
}

export function GlobalSearch({ 
  placeholder = '搜索项目、工作流...', 
  className = '' 
}: GlobalSearchProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);

  const openSearch = useCallback(() => {
    setIsOpen(true);
    setQuery('');
  }, []);

  const closeSearch = useCallback(() => {
    setIsOpen(false);
    setQuery('');
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (isOpen) {
          closeSearch();
        } else {
          openSearch();
        }
      }
      if (e.key === 'Escape' && isOpen) {
        closeSearch();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, openSearch, closeSearch]);

  useEffect(() => {
    if (query.trim()) {
      setResults([
        { id: '1', title: `搜索 "${query}" 的结果...`, type: 'project', href: `/dashboard?search=${query}` },
      ]);
    } else {
      setResults([]);
    }
  }, [query]);

  return (
    <>
      <button
        onClick={openSearch}
        className={cn(
          "flex items-center gap-3 px-4 py-2 rounded-lg",
          "bg-muted/50 border border-border/50",
          "text-muted-foreground text-sm",
          "hover:bg-muted hover:border-border",
          "transition-all duration-200",
          "w-full max-w-xs",
          className
        )}
      >
        <Search className="w-4 h-4 flex-shrink-0" />
        <span className="flex-1 text-left truncate">{placeholder}</span>
        <kbd className="hidden md:inline-flex items-center gap-1 px-2 py-0.5 rounded bg-background border border-border text-[11px] text-muted-foreground">
          <Command className="w-3 h-3" />
          <span>K</span>
        </kbd>
      </button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="p-0 gap-0 max-w-xl top-[20%] translate-y-0">
          <div className="flex items-center border-b border-border px-4">
            <Search className="w-5 h-5 text-muted-foreground mr-3" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={placeholder}
              className="border-0 shadow-none focus-visible:ring-0 px-0 py-4 text-base"
              autoFocus
            />
          </div>
          <AnimatePresence>
            {results.length > 0 && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                <ScrollArea className="max-h-80">
                  <div className="p-2">
                    {results.map((result) => (
                      <a
                        key={result.id}
                        href={result.href}
                        onClick={closeSearch}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-accent transition-colors"
                      >
                        <Search className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm">{result.title}</span>
                      </a>
                    ))}
                  </div>
                </ScrollArea>
              </motion.div>
            )}
          </AnimatePresence>
          {query && results.length === 0 && (
            <div className="py-8 text-center text-muted-foreground text-sm">
              {`没有找到 "${query}" 相关结果`}
            </div>
          )}
          {!query && (
            <div className="py-8 text-center text-muted-foreground text-sm">
              输入关键词开始搜索
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
