'use client';

import { Check, Cloud, CloudUpload, Loader2, Sparkles } from 'lucide-react';
import { cn } from '@/lib/cn';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'indexing' | 'indexed';

interface SaveStatusIndicatorProps {
  status: SaveStatus;
  className?: string;
}

const ICON_BY_STATUS = {
  idle: Cloud,
  saving: CloudUpload,
  saved: Check,
  indexing: Loader2,
  indexed: Sparkles,
} as const;

const LABEL_BY_STATUS: Record<SaveStatus, string> = {
  idle: '',
  saving: 'Saving…',
  saved: 'Saved',
  indexing: 'Indexing…',
  indexed: 'Indexed',
};

export function SaveStatusIndicator({ status, className }: SaveStatusIndicatorProps): JSX.Element | null {
  if (status === 'idle') return null;
  const Icon = ICON_BY_STATUS[status];
  return (
    <span
      role="status"
      aria-live="polite"
      className={cn(
        'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium',
        status === 'saving' && 'text-[hsl(var(--foreground-muted))]',
        status === 'saved' && 'text-[hsl(var(--success,var(--primary)))]',
        status === 'indexing' && 'text-[hsl(var(--foreground-muted))]',
        status === 'indexed' && 'text-[hsl(var(--primary))]',
        className,
      )}
    >
      <Icon
        className={cn(
          'h-3 w-3',
          status === 'indexing' && 'animate-spin',
        )}
        aria-hidden="true"
      />
      {LABEL_BY_STATUS[status]}
    </span>
  );
}
