'use client';

import { type ReactNode } from 'react';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

function EmptyState({
  icon,
  title,
  description,
  action,
  className = '',
}: EmptyStateProps) {
  return (
    <div
      className={`
        flex flex-col items-center justify-center text-center p-8
        ${className}
      `}
    >
      {icon && (
        <div className="mb-4 text-gray-500">
          {icon}
        </div>
      )}
      <h3 className="text-lg font-medium text-gray-200 mb-2">{title}</h3>
      {description && (
        <p className="text-sm text-gray-400 max-w-sm mb-4">{description}</p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export { EmptyState, type EmptyStateProps };
