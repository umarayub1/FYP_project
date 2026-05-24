'use client';

import { X, Trash2, FolderOpen, Tag } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface BulkActionBarProps {
  count: number;
  onDelete?: () => void;
  onMove?: () => void;
  onTag?: () => void;
  onCancel: () => void;
  /** slot for surface-specific extra actions */
  extra?: React.ReactNode;
}

export function BulkActionBar({ count, onDelete, onMove, onTag, onCancel, extra }: BulkActionBarProps) {
  if (count === 0) return null;

  return (
    <div
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 rounded-xl border border-border bg-surface shadow-lg px-4 py-2.5"
      role="toolbar"
      aria-label="Bulk actions"
    >
      <span className="text-sm font-medium text-foreground mr-2">
        {count} selected
      </span>

      {extra}

      {onMove && (
        <Button size="sm" variant="outline" className="text-xs h-7 gap-1.5" onClick={onMove}>
          <FolderOpen className="h-3.5 w-3.5" aria-hidden="true" />
          Move
        </Button>
      )}

      {onTag && (
        <Button size="sm" variant="outline" className="text-xs h-7 gap-1.5" onClick={onTag}>
          <Tag className="h-3.5 w-3.5" aria-hidden="true" />
          Tag
        </Button>
      )}

      {onDelete && (
        <Button
          size="sm"
          variant="outline"
          className="text-xs h-7 gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10"
          onClick={onDelete}
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          Delete
        </Button>
      )}

      <button
        type="button"
        onClick={onCancel}
        className="ml-1 text-foreground-muted hover:text-foreground cursor-pointer"
        aria-label="Clear selection"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
