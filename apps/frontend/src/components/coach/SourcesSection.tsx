'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, FileText, StickyNote } from 'lucide-react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { cn } from '@/lib/cn';
import type { Citation } from '@/hooks/useSSEChat';

interface SourcesSectionProps {
  citations:  Citation[];
  studySetId?: string;
}

/**
 * Collapsed-by-default list of every citation that appears in the reply.
 * Lives at the bottom of an assistant message so users always have a
 * reliable path to the sources, even if the inline `[N]` hover-chip is
 * fiddly. Click the header → expands to a numbered list with snippet +
 * jump-to-source link per row.
 */
export function SourcesSection({ citations, studySetId }: SourcesSectionProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  if (citations.length === 0) return null;

  function navigateTo(c: Citation) {
    if (!c.sourceId || !studySetId) return;
    const base = `/sets/${studySetId}`;
    const path = c.sourceType === 'note'
      ? `${base}/notes/${c.sourceId}`
      : c.pageNumber
        ? `${base}/documents/${c.sourceId}?page=${c.pageNumber}`
        : `${base}/documents/${c.sourceId}`;
    router.push(path);
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="mt-2">
      <CollapsibleTrigger
        className={cn(
          'flex items-center gap-1.5 rounded px-1.5 py-0.5 text-[11px] text-foreground-subtle',
          'hover:text-foreground hover:bg-surface-2 transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
        )}
        aria-label={open ? 'Hide sources' : 'Show sources'}
      >
        <ChevronDown
          className={cn('h-3 w-3 transition-transform', open && 'rotate-180')}
          aria-hidden="true"
        />
        <span className="font-mono">
          Sources · {citations.length}
        </span>
      </CollapsibleTrigger>

      <CollapsibleContent
        className="
          mt-1.5 flex flex-col gap-1.5
          data-[state=open]:animate-in data-[state=closed]:animate-out
          data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0
        "
      >
        {citations.map(c => {
          const Icon = c.sourceType === 'note' ? StickyNote : FileText;
          return (
            <button
              key={`${c.n}-${c.chunkId}`}
              type="button"
              onClick={() => navigateTo(c)}
              disabled={!c.sourceId || !studySetId}
              className="
                group flex w-full items-start gap-2 rounded-md border border-border bg-surface-2 px-2.5 py-1.5
                text-left text-[11px] text-foreground-muted hover:text-foreground hover:bg-surface-3
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring
                transition-colors disabled:opacity-50 disabled:cursor-not-allowed
              "
              aria-label={`Open source ${c.n}: ${c.sourceTitle}`}
            >
              <span className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded bg-primary/10 text-primary font-mono text-[10px]">
                {c.n}
              </span>
              <Icon className="mt-0.5 h-3 w-3 shrink-0 text-foreground-subtle" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-foreground">
                  {c.sourceTitle}
                  {c.pageNumber ? (
                    <span className="ml-1 font-mono text-[10px] text-foreground-subtle">
                      p.{c.pageNumber}
                    </span>
                  ) : null}
                </p>
                {c.snippet && (
                  <p className="mt-0.5 line-clamp-2 leading-snug text-foreground-subtle group-hover:text-foreground-muted">
                    {c.snippet}
                  </p>
                )}
              </div>
            </button>
          );
        })}
      </CollapsibleContent>
    </Collapsible>
  );
}
