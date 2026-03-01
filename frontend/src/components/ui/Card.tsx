'use client';

import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';

type CardVariant = 'default' | 'elevated' | 'outlined' | 'gradient';

interface CardProps {
  variant?: CardVariant;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  hoverable?: boolean;
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}

const variantStyles: Record<CardVariant, string> = {
  default: 'bg-card border-border',
  elevated: 'bg-card shadow-lg shadow-black/20',
  outlined: 'bg-transparent border-border',
  gradient: 'bg-gradient-to-br from-card to-secondary border-border',
};

const paddingStyles: Record<'none' | 'sm' | 'md' | 'lg', string> = {
  none: '',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-6',
};

function Card({
  variant = 'default',
  padding = 'md',
  hoverable = false,
  children,
  className = '',
  onClick,
}: CardProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'rounded-xl',
        variantStyles[variant],
        paddingStyles[padding],
        hoverable ? 'hover:border-primary/50 hover:bg-accent/50 transition-all cursor-pointer' : '',
        onClick ? 'cursor-pointer' : '',
        className
      )}
    >
      {children}
    </div>
  );
}

interface CardHeaderProps {
  children: ReactNode;
  className?: string;
}

function CardHeader({ children, className = '' }: CardHeaderProps) {
  return (
    <div className={cn('mb-4', className)}>
      {children}
    </div>
  );
}

interface CardTitleProps {
  children: ReactNode;
  className?: string;
}

function CardTitle({ children, className = '' }: CardTitleProps) {
  return (
    <h3 className={cn('text-lg font-bold text-foreground', className)}>
      {children}
    </h3>
  );
}

interface CardDescriptionProps {
  children: ReactNode;
  className?: string;
}

function CardDescription({ children, className = '' }: CardDescriptionProps) {
  return (
    <p className={cn('text-sm text-muted-foreground mt-1', className)}>
      {children}
    </p>
  );
}

interface CardContentProps {
  children: ReactNode;
  className?: string;
}

function CardContent({ children, className = '' }: CardContentProps) {
  return (
    <div className={className}>
      {children}
    </div>
  );
}

interface CardFooterProps {
  children: ReactNode;
  className?: string;
}

function CardFooter({ children, className = '' }: CardFooterProps) {
  return (
    <div className={cn('mt-4 pt-4 border-t border-border', className)}>
      {children}
    </div>
  );
}

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, type CardProps, type CardVariant };
