import * as React from 'react';
import { cn } from '@/lib/cn';

interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'warning' | 'danger' | 'success';
  dismissible?: boolean;
  onDismiss?: () => void;
}

export function Alert({ className, variant = 'default', dismissible, onDismiss, children, ...props }: AlertProps) {
  return (
    <div
      role="alert"
      className={cn(
        'relative flex items-start gap-3 rounded-lg border px-4 py-3 text-sm',
        variant === 'default' && 'bg-surface border-border text-foreground',
        variant === 'warning' && 'bg-warning/10 border-warning/30 text-foreground',
        variant === 'danger'  && 'bg-destructive/10 border-destructive/30 text-foreground',
        variant === 'success' && 'bg-success-soft border-success/30 text-foreground',
        className
      )}
      {...props}
    >
      <div className="flex-1">{children}</div>
      {dismissible && onDismiss && (
        <button
          onClick={onDismiss}
          className="rounded p-0.5 hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring cursor-pointer shrink-0"
          aria-label="Dismiss"
        >
          <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>
      )}
    </div>
  );
}
