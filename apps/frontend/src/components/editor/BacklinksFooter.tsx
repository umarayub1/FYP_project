'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeftRight, FileText, ChevronsUpDown, Loader2 } from 'lucide-react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { cn } from '@/lib/cn';
import { getNoteBacklinks, type BacklinkRef } from '@/lib/api/notes';

interface BacklinksFooterProps {
  noteId: string;
  studySetId: string;
  /** Force a refetch — bump this when the note's content changes so newly
   *  added inline links from other notes get picked up. Optional. */
  refreshKey?: number;
}

// "What links here" — collapsible list of notes that reference this one via
// `parentNoteId` (subpage hierarchy) or inline `[[note-link]]` atoms. Quiet
// when there are none.
export function BacklinksFooter({
  noteId,
  studySetId,
  refreshKey,
}: BacklinksFooterProps): JSX.Element | null {
  const [refs, setRefs] = useState<BacklinkRef[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    if (!noteId || !studySetId) return;
    let cancelled = false;
    setLoading(true);
    getNoteBacklinks(noteId, studySetId)
      .then(list => {
        if (cancelled) return;
        setRefs(list);
      })
      .catch(() => {
        if (cancelled) return;
        setRefs([]);
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [noteId, studySetId, refreshKey]);

  if (loading) {
    return (
      <div className="mt-8 flex items-center gap-2 border-t border-[hsl(var(--border))] pt-3 text-xs text-[hsl(var(--foreground-subtle))]">
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
        Loading backlinks…
      </div>
    );
  }

  if (!refs || refs.length === 0) return null;

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="mt-8 border-t border-[hsl(var(--border))] pt-3"
    >
      <CollapsibleTrigger className="flex w-full items-center gap-2 text-left text-[10px] font-medium uppercase tracking-wider text-[hsl(var(--foreground-subtle))] hover:text-[hsl(var(--foreground-muted))]">
        <ArrowLeftRight className="h-3 w-3" aria-hidden="true" />
        <span>Backlinks · {refs.length}</span>
        <ChevronsUpDown className="ml-auto h-3 w-3" aria-hidden="true" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul className="mt-2 space-y-0.5">
          {refs.map(ref => (
            <li key={ref._id}>
              <Link
                href={`/sets/${studySetId}/notes/${ref._id}`}
                className={cn(
                  'flex items-center gap-2 rounded px-2 py-1 text-sm transition-colors',
                  'text-[hsl(var(--foreground-muted))] hover:bg-[hsl(var(--surface-2))] hover:text-[hsl(var(--foreground))]',
                )}
                title={`Open ${ref.title || 'Untitled'}`}
              >
                <FileText className="h-3.5 w-3.5 shrink-0 text-[hsl(var(--foreground-subtle))]" aria-hidden="true" />
                <span className="truncate">{ref.title || 'Untitled'}</span>
                <span
                  className={cn(
                    'ml-auto shrink-0 rounded px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-wider',
                    ref.sourceType === 'parent'
                      ? 'bg-[hsl(var(--surface-2))] text-[hsl(var(--foreground-subtle))]'
                      : 'bg-[hsl(var(--primary-soft))] text-[hsl(var(--primary))]',
                  )}
                >
                  {ref.sourceType}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}
