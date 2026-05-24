'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FileText, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/cn';
import { getNotes, type Note } from '@/lib/api/notes';

interface NoteLinkPickerProps {
  open: boolean;
  onClose: () => void;
  /** Inserter — caller wires it into the TipTap editor. */
  onPick: (note: { _id: string; title: string }) => void;
  studySetId?: string;
  /** Optional — exclude self so a note can't link to itself. */
  currentNoteId?: string;
}

// Type-to-search picker for the `[[` / `/link` / Mod-[ flows. Loads notes for
// the current StudySet, filters by title client-side, returns selection up to
// the editor host which inserts a `noteLink` atom.
export function NoteLinkPicker({
  open,
  onClose,
  onPick,
  studySetId,
  currentNoteId,
}: NoteLinkPickerProps): JSX.Element {
  const [query, setQuery] = useState('');
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  // Reset on open, focus the input, refetch the note list.
  useEffect(() => {
    if (!open || !studySetId) return;
    setQuery('');
    setSelectedIndex(0);
    setError(null);
    setLoading(true);
    queueMicrotask(() => inputRef.current?.focus());
    getNotes(studySetId)
      .then(list => setNotes(list))
      .catch(() => setError('Could not load notes.'))
      .finally(() => setLoading(false));
  }, [open, studySetId]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    let pool = notes.filter(n => n._id !== currentNoteId);
    if (q) {
      pool = pool.filter(n => (n.title || 'Untitled').toLowerCase().includes(q));
    }
    return pool.slice(0, 50);
  }, [notes, query, currentNoteId]);

  // Clamp the selected index to the result set when the query changes.
  useEffect(() => {
    setSelectedIndex(prev => Math.min(prev, Math.max(0, results.length - 1)));
  }, [results.length]);

  const commit = useCallback(
    (idx: number) => {
      const target = results[idx];
      if (!target) return;
      onPick({ _id: target._id, title: target.title || 'Untitled' });
      onClose();
    },
    [results, onPick, onClose],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => (results.length === 0 ? 0 : (i + 1) % results.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i =>
        results.length === 0 ? 0 : (i - 1 + results.length) % results.length,
      );
    } else if (e.key === 'Enter') {
      e.preventDefault();
      commit(selectedIndex);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  // Scroll the highlighted row into view.
  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${selectedIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex, open]);

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-md p-0">
        <DialogHeader className="border-b border-[hsl(var(--border))] px-3 py-2">
          <DialogTitle className="text-sm font-medium">Link a note</DialogTitle>
        </DialogHeader>

        <div className="border-b border-[hsl(var(--border))] px-3 py-2">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search notes…"
            className="w-full bg-transparent text-sm focus-visible:outline-none placeholder:text-[hsl(var(--foreground-subtle))]"
          />
        </div>

        <div ref={listRef} className="max-h-72 overflow-y-auto py-1">
          {loading && (
            <div className="flex items-center justify-center gap-2 px-3 py-4 text-xs text-[hsl(var(--foreground-subtle))]">
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
              Loading notes…
            </div>
          )}
          {error && (
            <p className="px-3 py-4 text-xs text-[hsl(var(--danger))]" role="alert">{error}</p>
          )}
          {!loading && !error && results.length === 0 && (
            <p className="px-3 py-4 text-xs text-[hsl(var(--foreground-subtle))]">
              {query.trim() ? `No matches for "${query.trim()}"` : 'No notes in this set yet.'}
            </p>
          )}
          {results.map((note, idx) => {
            const active = idx === selectedIndex;
            return (
              <button
                key={note._id}
                type="button"
                role="option"
                aria-selected={active}
                data-idx={idx}
                onMouseEnter={() => setSelectedIndex(idx)}
                onMouseDown={e => {
                  e.preventDefault();
                  commit(idx);
                }}
                className={cn(
                  'flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors',
                  active
                    ? 'bg-[hsl(var(--surface-2))] text-[hsl(var(--foreground))]'
                    : 'text-[hsl(var(--foreground-muted))] hover:bg-[hsl(var(--surface-2))]',
                )}
              >
                <FileText className="h-3.5 w-3.5 shrink-0 text-[hsl(var(--foreground-subtle))]" aria-hidden="true" />
                <span className="truncate">{note.title || 'Untitled'}</span>
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
