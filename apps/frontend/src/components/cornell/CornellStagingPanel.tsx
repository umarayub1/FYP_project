'use client';

import { useState } from 'react';
import { Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface CornellStagingPanelProps {
  stagedCount: number;
  onCommit: () => Promise<void>;
  onDiscard: () => void;
}

export function CornellStagingPanel({ stagedCount, onCommit, onDiscard }: CornellStagingPanelProps) {
  const [isCommitting, setIsCommitting] = useState(false);
  const [feedback, setFeedback] = useState<'success' | 'error' | null>(null);

  async function handleCommit() {
    setIsCommitting(true);
    setFeedback(null);
    try {
      await onCommit();
      setFeedback('success');
      setTimeout(() => setFeedback(null), 3000);
    } catch {
      setFeedback('error');
      setTimeout(() => setFeedback(null), 4000);
    } finally {
      setIsCommitting(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-2 border-b border-border shrink-0">
        <p className="text-sm font-medium">
          {stagedCount} {stagedCount === 1 ? 'block' : 'blocks'} staged
        </p>
      </div>

      {/* Body */}
      <div className="flex-1 px-4 py-4 flex flex-col gap-3">
        {stagedCount === 0 ? (
          <p className="text-sm text-[hsl(var(--foreground-subtle))]">
            Highlight text in the editor to stage blocks for Cornell notes.
          </p>
        ) : (
          <p className="text-sm text-foreground-muted">
            {stagedCount} {stagedCount === 1 ? 'block is' : 'blocks are'} ready to commit to this Cornell note.
          </p>
        )}

        {feedback === 'success' && (
          <div className="flex items-center gap-2 rounded-md bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 px-3 py-2 text-xs text-green-700 dark:text-green-400">
            <CheckCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Committed to Cornell notes.
          </div>
        )}
        {feedback === 'error' && (
          <div className="flex items-center gap-2 rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2 text-xs text-destructive">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Failed to commit notes. Please try again.
          </div>
        )}
      </div>

      {/* Footer actions */}
      {stagedCount > 0 && (
        <div className="px-4 pb-4 shrink-0 flex gap-2">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm" className="flex-1">
                Discard
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Discard staged blocks?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will remove {stagedCount} staged {stagedCount === 1 ? 'block' : 'blocks'}. This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep</AlertDialogCancel>
                <AlertDialogAction onClick={onDiscard}>Discard</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <Button size="sm" className="flex-1 gap-1" onClick={handleCommit} disabled={isCommitting}>
            {isCommitting && <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />}
            {isCommitting ? 'Committing…' : 'Commit'}
          </Button>
        </div>
      )}
    </div>
  );
}
