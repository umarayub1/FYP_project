'use client';

import Link from 'next/link';
import { Play, Zap, BookOpen, Layers } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { cn } from '@/lib/cn';

export interface ReviewableSet {
  _id:      string;
  name:     string;
  color?:   string;
  due:      number;
  overdue:  number;
}

interface ReviewStartDialogProps {
  open:      boolean;
  onClose:   () => void;
  sets:      ReviewableSet[];
  totalDue:  number;
}

export function ReviewStartDialog({ open, onClose, sets, totalDue }: ReviewStartDialogProps) {
  const setsWithDue   = sets.filter(s => s.due > 0);
  const setsCaughtUp  = sets.filter(s => s.due === 0);

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-md w-full p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-3 border-b border-border">
          <DialogTitle>Start a review session</DialogTitle>
          <DialogDescription>
            Pick a deck to review, or run all due cards together.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto px-3 py-3 space-y-3">
          {/* Review all */}
          {totalDue > 0 && (
            <Link
              href="/flashcards/review/all"
              onClick={onClose}
              className={cn(
                'flex items-center gap-3 rounded-lg border border-primary/50 bg-primary/8 px-4 py-3 transition-colors',
                'hover:bg-primary/12 hover:border-primary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
              )}
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-fg">
                <Layers className="h-4 w-4" aria-hidden="true" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">Review all due</p>
                <p className="text-xs text-foreground-muted">
                  {totalDue} card{totalDue !== 1 ? 's' : ''} across {setsWithDue.length} deck{setsWithDue.length !== 1 ? 's' : ''}
                </p>
              </div>
              <Play className="h-4 w-4 text-primary shrink-0" aria-hidden="true" />
            </Link>
          )}

          {/* Per-set list — due first */}
          {setsWithDue.length > 0 && (
            <div className="space-y-1">
              <p className="px-2 text-[10px] font-medium uppercase tracking-widest text-foreground-subtle">
                Decks with due cards
              </p>
              <ul className="space-y-1" role="list">
                {setsWithDue.map(s => (
                  <li key={s._id}>
                    <Link
                      href={`/sets/${s._id}/flashcards/review`}
                      onClick={onClose}
                      className="flex items-center gap-3 rounded-md px-3 py-2 hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring transition-colors"
                    >
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: s.color ?? 'hsl(var(--primary))' }}
                        aria-hidden="true"
                      />
                      <span className="flex-1 truncate text-sm text-foreground">{s.name}</span>
                      <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                        <BookOpen className="h-3 w-3" aria-hidden="true" />
                        {s.due}
                      </span>
                      {s.overdue > 0 && (
                        <span className="shrink-0 rounded-full bg-danger-soft px-2 py-0.5 text-xs font-medium text-danger">
                          {s.overdue} overdue
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Caught-up sets — offer Cram */}
          {setsCaughtUp.length > 0 && (
            <div className="space-y-1">
              <p className="px-2 text-[10px] font-medium uppercase tracking-widest text-foreground-subtle">
                Caught up — cram anyway
              </p>
              <ul className="space-y-1" role="list">
                {setsCaughtUp.map(s => (
                  <li key={s._id}>
                    <Link
                      href={`/sets/${s._id}/flashcards/review?cram=true`}
                      onClick={onClose}
                      className="flex items-center gap-3 rounded-md px-3 py-2 hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring transition-colors"
                    >
                      <span
                        className="h-2 w-2 shrink-0 rounded-full opacity-40"
                        style={{ backgroundColor: s.color ?? 'hsl(var(--primary))' }}
                        aria-hidden="true"
                      />
                      <span className="flex-1 truncate text-sm text-foreground-muted">{s.name}</span>
                      <span className="shrink-0 inline-flex items-center gap-1 text-xs text-foreground-subtle">
                        <Zap className="h-3 w-3" aria-hidden="true" />
                        Cram
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {sets.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-foreground-muted">
              No study sets yet. Create one to start reviewing.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
