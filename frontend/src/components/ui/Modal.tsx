'use client';

import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';

type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | 'full';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  size?: ModalSize;
  children: ReactNode;
  showCloseButton?: boolean;
  className?: string;
}

const sizeStyles: Record<ModalSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  full: 'max-w-4xl',
};

function Modal({
  isOpen,
  onClose,
  title,
  description,
  size = 'md',
  children,
  showCloseButton = true,
  className = '',
}: ModalProps) {
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }
    
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`
          bg-card border border-border rounded-xl shadow-2xl w-full
          ${sizeStyles[size]}
          overflow-hidden transform transition-all scale-100
          ${className}
        `}
        role="dialog"
        aria-modal="true"
      >
        {(title || showCloseButton) && (
          <div className="flex items-center justify-between p-4 border-b border-border">
            <div>
              {title && <h3 className="text-lg font-bold text-foreground">{title}</h3>}
              {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
            </div>
            {showCloseButton && (
              <button
                onClick={onClose}
                className="text-muted-foreground hover:text-foreground p-1.5 hover:bg-accent rounded transition-colors"
                aria-label="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

interface ModalBodyProps {
  children: ReactNode;
  className?: string;
}

function ModalBody({ children, className = '' }: ModalBodyProps) {
  return <div className={`p-4 ${className}`}>{children}</div>;
}

interface ModalFooterProps {
  children: ReactNode;
  className?: string;
}

function ModalFooter({ children, className = '' }: ModalFooterProps) {
  return (
    <div className={`bg-card/50 p-4 flex justify-end gap-3 border-t border-border ${className}`}>
      {children}
    </div>
  );
}

export { Modal, ModalBody, ModalFooter, type ModalProps, type ModalSize };
