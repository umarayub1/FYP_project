'use client';

import { useState, useEffect, useRef, useId } from 'react';
import { Search, X, ChevronUp, ChevronDown } from 'lucide-react';

interface PDFFindBarProps {
  onSearch: (query: string) => void;
  onCycleMatch: (direction: 'next' | 'prev') => void;
  onClose: () => void;
  matchCount: number;
  currentMatch: number;
}

export function PDFFindBar({ onSearch, onCycleMatch, onClose, matchCount, currentMatch }: PDFFindBarProps) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const statusId = useId();

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setQuery(e.target.value);
    onSearch(e.target.value);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.shiftKey ? onCycleMatch('prev') : onCycleMatch('next');
    }
  }

  return (
    <div
      role="search"
      className="flex items-center gap-2 border-b border-border bg-background px-4 py-2"
      aria-label="Find in document"
    >
      <Search className="h-3.5 w-3.5 text-foreground-subtle shrink-0" aria-hidden="true" />
      <input
        ref={inputRef}
        type="search"
        value={query}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder="Find in document…"
        className="flex-1 bg-transparent text-sm text-foreground placeholder:text-foreground-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring rounded"
        aria-label="Search document"
        aria-controls={statusId}
        aria-autocomplete="none"
      />
      <span
        id={statusId}
        aria-live="polite"
        aria-atomic="true"
        className="text-xs text-foreground-muted shrink-0 min-w-12 text-center"
      >
        {query && matchCount > 0 ? `${currentMatch} of ${matchCount}` : query ? 'No matches' : ''}
      </span>
      <button
        onClick={() => onCycleMatch('prev')}
        disabled={matchCount === 0}
        className="flex items-center justify-center rounded min-h-[44px] min-w-[44px] md:min-h-8 md:min-w-8 hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring cursor-pointer disabled:opacity-40"
        aria-label="Previous match"
      >
        <ChevronUp className="h-3.5 w-3.5 text-foreground-muted" aria-hidden="true" />
      </button>
      <button
        onClick={() => onCycleMatch('next')}
        disabled={matchCount === 0}
        className="flex items-center justify-center rounded min-h-[44px] min-w-[44px] md:min-h-8 md:min-w-8 hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring cursor-pointer disabled:opacity-40"
        aria-label="Next match"
      >
        <ChevronDown className="h-3.5 w-3.5 text-foreground-muted" aria-hidden="true" />
      </button>
      <button
        onClick={onClose}
        className="flex items-center justify-center rounded min-h-[44px] min-w-[44px] md:min-h-8 md:min-w-8 hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring cursor-pointer"
        aria-label="Close find bar"
      >
        <X className="h-3.5 w-3.5 text-foreground-muted" aria-hidden="true" />
      </button>
    </div>
  );
}
