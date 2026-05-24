'use client';

import { useState, useEffect, useRef, useCallback, useId } from 'react';
import { useRouter } from 'next/navigation';
import { Search, X, FileText, BookOpen, MessageSquare, File, Clock, Loader2 } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { search, type SearchResult, type SearchOptions } from '@/lib/api/search';
import type { StudySet } from '@/lib/api/study-sets';
import { cn } from '@/lib/cn';
import { EmptyState } from '@/components/patterns/EmptyState';

const RECENT_KEY = 'synapse:search:recent';
const MAX_RECENT = 5;

const TYPE_ICONS: Record<SearchResult['type'], React.ComponentType<{ className?: string }>> = {
  note:      FileText,
  pdf:       File,
  flashcard: BookOpen,
  chat:      MessageSquare,
};

type FilterType = 'all' | SearchResult['type'];

function getRecent(): string[] {
  if (typeof localStorage === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]'); }
  catch { return []; }
}

function pushRecent(q: string) {
  const prev = getRecent().filter(r => r !== q);
  localStorage.setItem(RECENT_KEY, JSON.stringify([q, ...prev].slice(0, MAX_RECENT)));
}

function highlightExcerpt(excerpt: string, ranges: { start: number; end: number }[]): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const { start, end } of ranges) {
    if (start > last) parts.push(excerpt.slice(last, start));
    parts.push(
      <strong key={key++} className="font-medium text-foreground">
        {excerpt.slice(start, end)}
      </strong>
    );
    last = end;
  }
  if (last < excerpt.length) parts.push(excerpt.slice(last));
  return parts;
}

interface SearchOverlayProps {
  open?: boolean;
  onClose: () => void;
  initialQuery?:  string;
  initialType?:   string;
  initialSetId?:  string;
  studySets?: StudySet[];
  /** Render as a full-page fixed overlay (for the /search route) instead of a Dialog */
  asPage?: boolean;
}

export function SearchOverlay({
  open = true,
  onClose,
  initialQuery = '',
  initialType,
  initialSetId,
  studySets = [],
  asPage = false,
}: SearchOverlayProps) {
  const router      = useRouter();
  const listId      = useId();
  const inputRef    = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [query,   setQuery]   = useState(initialQuery);
  const [filter,  setFilter]  = useState<FilterType>((initialType as FilterType) ?? 'all');
  const [setId,   setSetId]   = useState(initialSetId ?? '');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [active,  setActive]  = useState(-1);
  const [recent,  setRecent]  = useState<string[]>([]);

  useEffect(() => {
    if (open || asPage) {
      setQuery(initialQuery);
      setRecent(getRecent());
      setActive(-1);
    }
  }, [open, asPage, initialQuery]);

  useEffect(() => {
    if (asPage) inputRef.current?.focus();
  }, [asPage]);

  const doSearch = useCallback(async (q: string, ft: FilterType, sid: string) => {
    if (!q.trim()) { setResults([]); setLoading(false); return; }
    setLoading(true);
    const opts: SearchOptions = {};
    if (ft !== 'all') opts.type = ft;
    if (sid) opts.studySetId = sid;
    try {
      const res = await search(q, opts);
      setResults(res);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(query, filter, setId), 200);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, filter, setId, doSearch]);

  useEffect(() => {
    if ((open || asPage) && query) {
      router.replace(`/search?q=${encodeURIComponent(query)}`, { scroll: false });
    }
  }, [open, asPage, query, router]);

  function handleOpen(result: SearchResult, newTab = false) {
    const href =
      result.type === 'note'      ? `/sets/${result.studySetId}/notes/${result.id}` :
      result.type === 'pdf'       ? `/sets/${result.studySetId}/documents/${result.id}${result.pageNumber ? `?page=${result.pageNumber}` : ''}` :
      result.type === 'flashcard' ? `/sets/${result.studySetId}/flashcards` :
                                    `/sets/${result.studySetId}`;
    pushRecent(query);
    onClose();
    if (newTab) { window.open(href, '_blank'); return; }
    router.push(href);
  }

  function deleteRecent(q: string) {
    const updated = getRecent().filter(r => r !== q);
    localStorage.setItem(RECENT_KEY, JSON.stringify(updated));
    setRecent(updated);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    const total = results.length;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive(a => Math.min(a + 1, total - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (active <= 0) {
        inputRef.current?.focus();
        setActive(-1);
      } else {
        setActive(a => a - 1);
      }
    } else if (e.key === 'Home') {
      e.preventDefault();
      inputRef.current?.focus();
      setActive(-1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (query && active === -1 && results.length > 0) {
        handleOpen(results[0], e.metaKey || e.ctrlKey);
      } else if (active >= 0 && results[active]) {
        handleOpen(results[active], e.metaKey || e.ctrlKey);
      } else if (query) {
        pushRecent(query);
        setRecent(getRecent());
      }
    } else if (e.key === 'Escape') {
      onClose();
    }
  }

  const filters: { key: FilterType; label: string }[] = [
    { key: 'all',       label: 'All' },
    { key: 'note',      label: 'Notes' },
    { key: 'pdf',       label: 'PDFs' },
    { key: 'flashcard', label: 'Cards' },
    { key: 'chat',      label: 'Chats' },
  ];

  const innerContent = (
    <div className={cn(
      'flex flex-col',
      asPage && 'h-full w-full max-w-2xl mx-auto pt-10 px-4'
    )}>
      {/* Search input */}
      <div className={cn(
        'flex items-center gap-3 border-b border-border',
        asPage ? 'pb-4' : 'px-4 py-3 gap-2'
      )}>
        {loading
          ? <Loader2 className={cn('text-foreground-muted animate-spin shrink-0', asPage ? 'h-5 w-5' : 'h-4 w-4')} aria-hidden="true" />
          : <Search  className={cn('text-foreground-muted shrink-0',              asPage ? 'h-5 w-5' : 'h-4 w-4')} aria-hidden="true" />
        }
        <input
          ref={inputRef}
          autoFocus
          type="search"
          value={query}
          onChange={e => { setQuery(e.target.value); setActive(-1); }}
          onKeyDown={handleKeyDown}
          placeholder="Search notes, PDFs, flashcards, chats…"
          className={cn(
            'flex-1 bg-transparent text-foreground placeholder:text-foreground-subtle',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring rounded',
            asPage ? 'text-xl' : 'text-sm'
          )}
          role="combobox"
          aria-expanded={results.length > 0 || recent.length > 0}
          aria-controls={listId}
          aria-activedescendant={active >= 0 ? `search-result-${active}` : undefined}
          aria-autocomplete="list"
          aria-label="Search Synapse"
        />
        {query && (
          <button
            onClick={() => { setQuery(''); setResults([]); inputRef.current?.focus(); }}
            className="rounded p-0.5 text-foreground-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring cursor-pointer"
            aria-label="Clear search"
          >
            <X className={cn('shrink-0', asPage ? 'h-4 w-4' : 'h-3.5 w-3.5')} aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Filter row */}
      <div className={cn(
        'flex items-center gap-1 border-b border-border flex-wrap',
        asPage ? 'py-3' : 'px-4 py-2'
      )}>
        <div role="group" aria-label="Filter by type" className="flex gap-0.5">
          {filters.map(f => (
            <button
              key={f.key}
              onClick={() => { setFilter(f.key); setActive(-1); }}
              className={cn(
                'rounded px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
                filter === f.key
                  ? 'bg-primary/10 text-primary border-b border-primary'
                  : 'text-foreground-muted hover:text-foreground'
              )}
              aria-pressed={filter === f.key}
            >
              {f.label}
            </button>
          ))}
        </div>

        {studySets.length > 0 && (
          <select
            value={setId}
            onChange={e => { setSetId(e.target.value); setActive(-1); }}
            className="ml-auto rounded-md border border-border bg-surface-2 px-2 py-1 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-focus-ring cursor-pointer"
            aria-label="Filter by study set"
          >
            <option value="">All Sets</option>
            {studySets.map(s => (
              <option key={s._id} value={s._id}>{s.name}</option>
            ))}
          </select>
        )}
      </div>

      {/* Results / recent */}
      <div
        id={listId}
        role="listbox"
        aria-label="Search results"
        className={cn(asPage ? 'flex-1 overflow-y-auto' : 'max-h-[50vh] sm:max-h-[480px] overflow-y-auto')}
      >
        {/* Result count */}
        {query && !loading && results.length > 0 && (
          <p className={cn('py-2 text-xs font-mono text-foreground-muted', asPage ? 'px-0 pt-3' : 'px-4')} aria-live="polite">
            {results.length} result{results.length !== 1 ? 's' : ''}
          </p>
        )}

        {/* Result rows */}
        {results.map((r, i) => {
          const Icon = TYPE_ICONS[r.type];
          return (
            <button
              key={r.id}
              id={`search-result-${i}`}
              role="option"
              aria-selected={i === active}
              onClick={e => handleOpen(r, e.metaKey || e.ctrlKey)}
              onMouseEnter={() => setActive(i)}
              onKeyDown={handleKeyDown}
              className={cn(
                'w-full flex items-start gap-3 py-3 text-left transition-colors cursor-pointer border-l-2',
                'focus-visible:outline-none',
                asPage ? 'px-2' : 'px-4',
                i === active
                  ? 'border-primary bg-surface-2'
                  : 'border-transparent hover:bg-surface-2'
              )}
            >
              <div className="shrink-0 mt-0.5 rounded-md bg-surface-2 border border-border p-1">
                <Icon className="h-3.5 w-3.5 text-foreground-muted" aria-hidden="true" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm font-medium text-foreground truncate">{r.title}</span>
                  <span className="text-xs font-mono text-foreground-subtle shrink-0">{r.studySetName}</span>
                </div>
                <p className="text-xs text-foreground-muted line-clamp-2 leading-relaxed">
                  {highlightExcerpt(r.excerpt, r.matchRanges)}
                </p>
                {(r.pageNumber || r.matchCount) && (
                  <p className="text-[11px] font-mono text-foreground-subtle mt-0.5">
                    {r.pageNumber  && `p. ${r.pageNumber}`}
                    {r.pageNumber && r.matchCount && ' · '}
                    {r.matchCount  && `${r.matchCount} match${r.matchCount !== 1 ? 'es' : ''}`}
                  </p>
                )}
              </div>
            </button>
          );
        })}

        {/* No results */}
        {query && !loading && results.length === 0 && (
          <EmptyState
            icon={<Search className="h-6 w-6" aria-hidden="true" />}
            headline={`No matches for "${query}".`}
            subline="Try fewer words."
            action={
              <button
                onClick={() => router.push('/sets')}
                className="text-xs text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring rounded cursor-pointer"
              >
                Ask Smart Coach instead →
              </button>
            }
          />
        )}

        {/* Recent searches */}
        {!query && recent.length > 0 && (
          <div className={cn('py-2', asPage ? '' : 'px-4')}>
            <p className={cn(
              'text-xs font-medium text-foreground-subtle uppercase tracking-wider mb-2',
              asPage ? 'px-2' : ''
            )}>
              Recent searches
            </p>
            {recent.map((r, i) => (
              <div key={i} className="flex items-center group">
                <button
                  onClick={() => { setQuery(r); inputRef.current?.focus(); }}
                  className={cn(
                    'flex items-center gap-2 flex-1 rounded-md py-1.5 text-sm text-foreground-muted',
                    'hover:bg-surface-2 hover:text-foreground',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring cursor-pointer',
                    asPage ? 'px-2' : 'px-2'
                  )}
                >
                  <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  {r}
                </button>
                <button
                  onClick={() => deleteRecent(r)}
                  className={cn(
                    'opacity-0 group-hover:opacity-100 mr-1 rounded p-1 shrink-0',
                    'text-foreground-muted hover:text-foreground',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring cursor-pointer'
                  )}
                  aria-label={`Remove "${r}" from recent searches`}
                >
                  <X className="h-3 w-3" aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!query && recent.length === 0 && (
          <div className="px-4 py-8 text-center">
            <p className="text-sm text-foreground-muted">
              Search notes, PDFs, flashcards, and chats.
            </p>
          </div>
        )}
      </div>

      {/* Footer hints */}
      <div className={cn(
        'border-t border-border py-2 flex items-center gap-4 text-xs text-foreground-subtle shrink-0',
        asPage ? 'px-0 mt-auto' : 'px-4'
      )}>
        <span><kbd className="font-mono">↑↓</kbd> navigate</span>
        <span><kbd className="font-mono">↵</kbd> open</span>
        <span><kbd className="font-mono">⌘↵</kbd> new tab</span>
        <span><kbd className="font-mono">Esc</kbd> close</span>
      </div>
    </div>
  );

  if (asPage) {
    return (
      <div
        className="fixed inset-0 bg-background/95 backdrop-blur-sm flex flex-col overflow-hidden"
        style={{ zIndex: 'var(--z-modal)' } as React.CSSProperties}
        role="dialog"
        aria-modal="true"
        aria-label="Global search"
      >
        {innerContent}
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent
        className="w-[calc(100%-2rem)] max-w-sm sm:max-w-xl md:max-w-2xl p-0 gap-0 overflow-hidden"
        aria-label="Global search"
      >
        {innerContent}
      </DialogContent>
    </Dialog>
  );
}
