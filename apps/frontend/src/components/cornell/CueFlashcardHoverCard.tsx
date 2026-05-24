'use client';

import { useState, useId, useCallback } from 'react';
import { Link as LinkIcon, Trash2 } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/cn';
import type { Flashcard } from '@/lib/api/flashcards';

interface CueFlashcardHoverCardProps {
  card:     Flashcard | null;
  cueText:  string;
  onUnlink?: () => void;
}

function formatDue(card: Flashcard): string {
  if (!card.dueDate) return 'New';
  const due = new Date(card.dueDate);
  const now = new Date();
  const ms = due.getTime() - now.getTime();
  if (ms <= 0) return 'Due now';
  const days = Math.ceil(ms / 86_400_000);
  if (days === 1) return 'Due in 1 day';
  if (days < 7) return `Due in ${days}d`;
  if (days < 30) return `Due in ${Math.round(days / 7)}w`;
  return `Due in ${Math.round(days / 30)}mo`;
}

export function CueFlashcardHoverCard({ card, cueText, onUnlink }: CueFlashcardHoverCardProps) {
  const [open, setOpen] = useState(false);
  const [backExpanded, setBackExpanded] = useState(false);
  const popoverId = useId();

  const handleTriggerKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setOpen(v => !v);
    }
  }, []);

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) setBackExpanded(false); }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-describedby={popoverId}
          aria-label={card
            ? `Linked flashcard for cue ${cueText.slice(0, 40)}`
            : `Cue ${cueText.slice(0, 40)} — flashcard no longer exists`}
          onFocus={() => setOpen(true)}
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
          onKeyDown={handleTriggerKeyDown}
          className={cn(
            'inline-flex items-center justify-center rounded p-0.5',
            'text-foreground-subtle hover:text-primary transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
            !card && 'text-foreground-subtle/60',
          )}
        >
          <LinkIcon className="h-3 w-3" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        id={popoverId}
        side="right"
        align="start"
        sideOffset={6}
        className="w-72 p-3"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {card ? (
          <div className="space-y-2">
            <p className="text-[10px] uppercase tracking-wider text-foreground-subtle">Linked card</p>
            <p className="text-sm text-foreground font-medium leading-snug">{card.front}</p>
            {backExpanded ? (
              <p className="text-xs text-foreground-muted leading-snug whitespace-pre-wrap">{card.back}</p>
            ) : (
              <button
                type="button"
                onFocus={() => setBackExpanded(true)}
                onClick={() => setBackExpanded(true)}
                className="text-xs text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring rounded"
              >
                Show answer
              </button>
            )}
            <div className="flex items-center gap-3 pt-2 border-t border-border text-[10px] font-mono text-foreground-muted">
              <span>{formatDue(card)}</span>
              <span aria-hidden="true">·</span>
              <span>EF {(card.easeFactor ?? 2.5).toFixed(2)}</span>
              {(card.interval ?? 0) > 0 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{card.interval}d interval</span>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-foreground">This flashcard no longer exists.</p>
            <p className="text-xs text-foreground-muted">
              The card linked from &ldquo;{cueText.slice(0, 60)}&rdquo; was deleted.
            </p>
            {onUnlink && (
              <button
                type="button"
                onClick={() => { onUnlink(); setOpen(false); }}
                className="inline-flex items-center gap-1 text-xs text-danger hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring rounded"
              >
                <Trash2 className="h-3 w-3" aria-hidden="true" />
                Unlink
              </button>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
