'use client';

import { type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

type SpinnerSize = 'sm' | 'md' | 'lg' | 'xl';

interface SpinnerProps {
  size?: SpinnerSize;
  className?: string;
  label?: string;
}

const sizeStyles: Record<SpinnerSize, string> = {
  sm: 'w-4 h-4',
  md: 'w-6 h-6',
  lg: 'w-8 h-8',
  xl: 'w-12 h-12',
};

function Spinner({ size = 'md', className = '', label = 'Loading...' }: SpinnerProps) {
  return (
    <div
      role="status"
      aria-label={label}
      className={`inline-flex items-center justify-center ${className}`}
    >
      <Loader2 className={`${sizeStyles[size]} animate-spin text-blue-500`} />
      <span className="sr-only">{label}</span>
    </div>
  );
}

interface LoadingOverlayProps {
  loading?: boolean;
  children: ReactNode;
  spinnerSize?: SpinnerSize;
  label?: string;
  className?: string;
}

function LoadingOverlay({
  loading = false,
  children,
  spinnerSize = 'lg',
  label = 'Loading...',
  className = '',
}: LoadingOverlayProps) {
  if (!loading) return <>{children}</>;

  return (
    <div className={`relative ${className}`}>
      <div className="opacity-50 pointer-events-none">{children}</div>
      <div className="absolute inset-0 flex items-center justify-center bg-gray-900/50 rounded-lg">
        <Spinner size={spinnerSize} label={label} />
      </div>
    </div>
  );
}

export { Spinner, LoadingOverlay, type SpinnerProps, type SpinnerSize };
