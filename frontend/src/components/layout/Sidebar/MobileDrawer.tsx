'use client';

import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sidebar } from './Sidebar';
import { cn } from '@/lib/utils';

interface MobileDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  children?: ReactNode;
  onWorkflowClick?: () => void;
  onKnowledgeClick?: () => void;
  onTasksClick?: () => void;
}

export function MobileDrawer({ 
  isOpen, 
  onClose, 
  children, 
  onWorkflowClick,
  onKnowledgeClick,
  onTasksClick
}: MobileDrawerProps) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const handleWorkflowClick = () => {
    onWorkflowClick?.();
    onClose();
  };

  const handleKnowledgeClick = () => {
    onKnowledgeClick?.();
    onClose();
  };

  const handleTasksClick = () => {
    onTasksClick?.();
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/60 z-40 lg:hidden backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className={cn(
              "fixed inset-y-0 left-0 z-50",
              "w-[85vw] sm:w-80 md:w-80",
              "bg-sidebar border-r border-sidebar-border",
              "md:hidden flex flex-col"
            )}
          >
            <div className="flex items-center justify-between p-4 border-b border-sidebar-border">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-blue-600 flex items-center justify-center">
                  <span className="text-white font-bold text-sm">A</span>
                </div>
                <span className="font-semibold text-sm">Autonome</span>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              <Sidebar 
                onWorkflowClick={handleWorkflowClick}
                onKnowledgeClick={handleKnowledgeClick}
                onTasksClick={handleTasksClick}
              />
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
