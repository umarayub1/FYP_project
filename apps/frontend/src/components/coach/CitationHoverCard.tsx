'use client';

import { useState, useId, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, ExternalLink, ChevronDown } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/cn';
import type { Citation } from '@/hooks/useSSEChat';

interface CitationHoverCardProps {
  citation:   Citation;
  studySetId?: string;
}

const HOVER_EXPAND_DELAY_MS = 1500;
const HOVER_CLOSE_DELAY_MS  = 250;

export function CitationHoverCard({ citation, studySetId }: CitationHoverCardProps) {
  const router = useRouter();
  const [open, setOpen]         = useState(false);
  const [expanded, setExpanded] = useState(false);
  const popoverId   = useId();
  const expandTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);

  const navigateToSource = useCallback(() => {
    if (!citation.sourceId || !studySetId) return;
    const base = `/sets/${studySetId}`;
    const path = citation.sourceType === 'note'
      ? `${base}/notes/${citation.sourceId}`
      : citation.pageNumber
        ? `${base}/documents/${citation.sourceId}?page=${citation.pageNumber}`
        : `${base}/documents/${citation.sourceId}`;
    router.push(path);
    setOpen(false);
  }, [router, citation, studySetId]);

  const clearExpandTimer = useCallback(() => {
    if (expandTimer.current) {
      clearTimeout(expandTimer.current);
      expandTimer.current = null;
    }
  }, []);

  const clearCloseTimer = useCallback(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  const startExpandTimer = useCallback(() => {
    clearExpandTimer();
    if (!citation.fullText) return;
    expandTimer.current = setTimeout(() => setExpanded(true), HOVER_EXPAND_DELAY_MS);
  }, [citation.fullText, clearExpandTimer]);

  // Schedule a close that gets cancelled if the user mouses onto the popover
  // content. Without this, mousing from trigger → content closes the popover
  // before the content's onMouseEnter ever fires.
  const scheduleClose = useCallback(() => {
    clearCloseTimer();
    closeTimer.current = setTimeout(() => setOpen(false), HOVER_CLOSE_DELAY_MS);
  }, [clearCloseTimer]);

  const openImmediately = useCallback(() => {
    clearCloseTimer();
    setOpen(true);
  }, [clearCloseTimer]);

  // Reset expansion when the popover closes.
  useEffect(() => {
    if (!open) {
      clearExpandTimer();
      setExpanded(false);
    }
  }, [open, clearExpandTimer]);

  useEffect(() => () => { clearExpandTimer(); clearCloseTimer(); }, [clearExpandTimer, clearCloseTimer]);

  const handleTriggerKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if ((e.key === ' ' || e.key === 'Spacebar') && open && citation.fullText) {
      e.preventDefault();
      setExpanded(v => !v);
    } else if (e.key === 'Escape' && open) {
      setOpen(false);
    }
  };

  const showFullText = expanded && Boolean(citation.fullText);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-describedby={popoverId}
          aria-expanded={showFullText}
          aria-label={`Citation ${citation.n}: ${citation.sourceTitle}`}
          onClick={navigateToSource}
          onFocus={() => { openImmediately(); startExpandTimer(); }}
          onBlur={() => { clearExpandTimer(); scheduleClose(); }}
          onMouseEnter={() => { openImmediately(); startExpandTimer(); }}
          onMouseLeave={() => { clearExpandTimer(); scheduleClose(); }}
          onKeyDown={handleTriggerKeyDown}
          className={cn(
            'cursor-pointer rounded px-1 py-0.5 bg-primary/10 text-primary text-[10px] font-mono leading-none',
            'hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
          )}
        >
          {citation.n}
        </button>
      </PopoverTrigger>
      <PopoverContent
        id={popoverId}
        side="top"
        align="center"
        sideOffset={6}
        className={cn('p-3', showFullText ? 'w-96' : 'w-72')}
        onOpenAutoFocus={(e) => e.preventDefault()}
        onMouseEnter={() => { clearCloseTimer(); startExpandTimer(); }}
        onMouseLeave={() => { clearExpandTimer(); scheduleClose(); }}
      >
        <div className="flex items-start gap-2">
          <FileText className="h-3.5 w-3.5 mt-0.5 shrink-0 text-foreground-muted" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-foreground truncate">
              {citation.sourceTitle}
            </p>
            {citation.pageNumber ? (
              <p className="font-mono text-[10px] text-foreground-subtle">p. {citation.pageNumber}</p>
            ) : null}
          </div>
        </div>
        {citation.snippet && !showFullText && (
          <p className="mt-2 text-xs text-foreground-muted leading-snug whitespace-pre-wrap">
            {citation.snippet}
          </p>
        )}
        {showFullText && (
          <p className="mt-2 text-xs text-foreground leading-snug whitespace-pre-wrap max-h-64 overflow-y-auto">
            {citation.fullText}
          </p>
        )}
        <div className="mt-3 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={navigateToSource}
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring rounded"
            disabled={!citation.sourceId || !studySetId}
          >
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
            Jump to source
          </button>
          {citation.fullText && (
            <button
              type="button"
              onClick={() => setExpanded(v => !v)}
              className="inline-flex items-center gap-1 text-[11px] text-foreground-subtle hover:text-foreground rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
              aria-label={showFullText ? 'Collapse full source' : 'Expand full source'}
            >
              <ChevronDown
                className={cn('h-3 w-3 transition-transform', showFullText && 'rotate-180')}
                aria-hidden="true"
              />
              {showFullText ? 'Less' : 'More'}
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
