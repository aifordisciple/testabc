'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TabItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  closable?: boolean;
  onClose?: (e: React.MouseEvent) => void;
}

interface AnimatedTabsProps {
  tabs: TabItem[];
  activeTab: string;
  onChange: (tabId: string) => void;
  className?: string;
}

export function AnimatedTabs({ tabs, activeTab, onChange, className }: AnimatedTabsProps) {
  return (
    <div className={cn("flex items-center gap-1 p-1 rounded-lg bg-muted/50", className)}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={cn(
            "relative px-4 py-2 text-sm font-medium rounded-md transition-colors",
            "flex items-center gap-2",
            activeTab === tab.id
              ? "text-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {activeTab === tab.id && (
            <motion.div
              layoutId="activeTab"
              className="absolute inset-0 bg-background rounded-md shadow-sm"
              initial={false}
              transition={{
                type: "spring",
                stiffness: 300,
                damping: 30,
              }}
            />
          )}
          <span className="relative z-10 flex items-center gap-2">
            {tab.icon}
            {tab.label}
          </span>
        </button>
      ))}
    </div>
  );
}

interface AnimatedTabsUnderlineProps {
  tabs: TabItem[];
  activeTab: string;
  onChange: (tabId: string) => void;
  className?: string;
}

export function AnimatedTabsUnderline({ 
  tabs, 
  activeTab, 
  onChange, 
  className 
}: AnimatedTabsUnderlineProps) {
  const [hoveredTab, setHoveredTab] = useState<string | null>(null);

  const handleTabClick = (tabId: string, e: React.MouseEvent) => {
    const tab = tabs.find(t => t.id === tabId);
    if (tab?.closable && e.detail > 1) {
      e.preventDefault();
      return;
    }
    onChange(tabId);
  };

  const handleCloseClick = (e: React.MouseEvent, tab: TabItem) => {
    e.stopPropagation();
    if (tab.onClose) {
      tab.onClose(e);
    }
  };

  return (
    <div className={cn("flex items-center border-b border-border", className)}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={(e) => handleTabClick(tab.id, e)}
          onMouseEnter={() => setHoveredTab(tab.id)}
          onMouseLeave={() => setHoveredTab(null)}
          className={cn(
            "relative px-4 py-3 text-sm font-medium transition-colors",
            "flex items-center gap-2 group",
            activeTab === tab.id
              ? "text-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <span className="relative z-10 flex items-center gap-2">
            {tab.icon}
            {tab.label}
          </span>
          {tab.closable && (
            <span 
              className={cn(
                "ml-1 p-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity",
                "hover:bg-accent"
              )}
              onClick={(e) => handleCloseClick(e, tab)}
            >
              <X className="w-3.5 h-3.5" />
            </span>
          )}
          {activeTab === tab.id && (
            <motion.div
              layoutId="activeTabUnderline"
              className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary"
              initial={false}
              transition={{
                type: "spring",
                stiffness: 500,
                damping: 30,
              }}
            />
          )}
          {hoveredTab === tab.id && activeTab !== tab.id && (
            <motion.div
              layoutId="hoveredTabUnderline"
              className="absolute bottom-0 left-0 right-0 h-0.5 bg-muted-foreground/50"
              initial={false}
              transition={{
                type: "spring",
                stiffness: 500,
                damping: 30,
              }}
            />
          )}
        </button>
      ))}
    </div>
  );
}
