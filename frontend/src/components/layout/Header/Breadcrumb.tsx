'use client';

import { ChevronRight, Home } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
  className?: string;
}

export function Breadcrumb({ items, className = '' }: BreadcrumbProps) {
  return (
    <nav className={cn("flex items-center gap-1 text-sm", className)}>
      <Link
        href="/dashboard"
        className={cn(
          "p-1.5 rounded-md text-muted-foreground",
          "hover:text-foreground hover:bg-accent",
          "transition-colors duration-150"
        )}
      >
        <Home className="w-4 h-4" />
      </Link>
      {items.map((item, index) => (
        <div key={index} className="flex items-center gap-1">
          <ChevronRight className="w-4 h-4 text-muted-foreground/50" />
          {item.href && index < items.length - 1 ? (
            <Link
              href={item.href}
              className={cn(
                "px-2 py-1 rounded-md text-muted-foreground",
                "hover:text-foreground hover:bg-accent",
                "transition-colors duration-150"
              )}
            >
              {item.label}
            </Link>
          ) : (
            <span className="px-2 py-1 text-foreground font-medium truncate max-w-[200px]">
              {item.label}
            </span>
          )}
        </div>
      ))}
    </nav>
  );
}
