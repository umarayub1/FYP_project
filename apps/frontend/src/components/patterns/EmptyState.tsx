import React from 'react';
import { cn } from '@/lib/cn';

interface EmptyStateProps {
  icon: React.ReactNode;
  headline: string;
  subline?: string;
  action?: React.ReactNode;
  secondaryAction?: React.ReactNode;
  className?: string;
}

export function EmptyStateIcon({ children }: { children: React.ReactNode }) {
  return <span className="block h-6 w-6">{children}</span>;
}

export function EmptyState({
  icon,
  headline,
  subline,
  action,
  secondaryAction,
  className,
}: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center text-center py-16 px-8', className)}>
      <div className="mb-4 text-foreground-subtle">{icon}</div>
      <h2 className="text-base font-medium text-foreground mb-2 text-balance max-w-xs">{headline}</h2>
      {subline && <p className="text-sm text-foreground-muted mb-6 max-w-xs">{subline}</p>}
      {action && <div className="mb-2">{action}</div>}
      {secondaryAction && <div>{secondaryAction}</div>}
    </div>
  );
}
