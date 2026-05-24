'use client';

import { useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/cn';
import { renderMarkdownWithMath } from '@/lib/markdown/render';
import { type Snippet, searchSnippets } from '@/lib/editor/snippet-catalog';

interface TextareaSlashMenuProps {
  /** Open state. Driven by the host textarea's `/<query>` detection. */
  open:      boolean;
  /** The query the user typed after the `/`. */
  query:     string;
  /** Position to anchor the menu at — typically near the cursor caret. */
  anchor:    { top: number; left: number };
  /** Currently highlighted index. Host owns this so ↑↓ in the textarea works. */
  highlight: number;
  /** Notify host when the visible result set changes (so it can clamp highlight). */
  onResultsChange: (results: Snippet[]) => void;
  /** Insert + close. */
  onSelect:  (snippet: Snippet) => void;
  /** Close without inserting (Escape, click outside, etc.). */
  onClose:   () => void;
  /** Optional whitelist of categories. Host passes `['cloze']` inside a cloze
   *  block and `['math-bare']` inside a math input so each surface only
   *  surfaces snippets that make sense there. */
  categories?: Snippet['category'][];
}

const CATEGORY_LABEL: Record<Snippet['category'], string> = {
  math: 'tex',
  'math-bare': 'tex',
  structure: 'md',
  cloze: 'cloze',
};

/**
 * Searchable slash-command menu for plain `<textarea>` Markdown surfaces.
 *
 * The host element owns:
 * - whether the menu is open
 * - the query string (text after the `/`)
 * - the highlighted index
 * - keyboard handling on the textarea itself (↑↓ Enter Esc)
 *
 * This component just renders the filtered list and previews. Keeping the
 * keyboard ownership on the textarea avoids a focus-stealing portal — the
 * caret stays visible while the user navigates the menu.
 */
export function TextareaSlashMenu({
  open,
  query,
  anchor,
  highlight,
  onResultsChange,
  onSelect,
  onClose,
  categories,
}: TextareaSlashMenuProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const results = useMemo(
    () => searchSnippets(query, 20, categories ? { categories } : undefined),
    [query, categories],
  );

  // Tell the host when the result set changes so it can clamp the highlight
  // (otherwise ↓ past the end leaves the highlight pointing at nothing).
  useEffect(() => { onResultsChange(results); }, [results, onResultsChange]);

  // Click outside → close. Capture phase so we beat the textarea's blur.
  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) onClose();
    }
    document.addEventListener('mousedown', onMouseDown, true);
    return () => document.removeEventListener('mousedown', onMouseDown, true);
  }, [open, onClose]);

  // Scroll the highlighted row into view when the user arrow-keys past the edge.
  useEffect(() => {
    if (!open) return;
    const row = containerRef.current?.querySelector<HTMLElement>(`[data-row="${highlight}"]`);
    row?.scrollIntoView({ block: 'nearest' });
  }, [highlight, open]);

  if (!open) return null;
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={containerRef}
      role="listbox"
      aria-label="Insert snippet"
      className={cn(
        'fixed z-50 min-w-[320px] max-w-[420px] max-h-[280px] overflow-y-auto',
        'rounded-md border border-border bg-surface shadow-lg',
        'text-sm text-foreground',
      )}
      style={{ top: anchor.top, left: anchor.left }}
    >
      {results.length === 0 ? (
        <div className="px-3 py-2 text-foreground-subtle text-xs">
          No matches for &quot;{query}&quot;
        </div>
      ) : (
        results.map((s, i) => {
          const isActive = i === highlight;
          return (
            <button
              key={s.id}
              data-row={i}
              type="button"
              role="option"
              aria-selected={isActive}
              // Use onMouseDown (capture) so we fire before the textarea blurs
              // and resets the cursor.
              onMouseDown={(e) => { e.preventDefault(); onSelect(s); }}
              className={cn(
                'w-full grid grid-cols-[1fr_auto] items-center gap-3 px-3 py-1.5 text-left',
                'border-l-2 transition-colors',
                isActive
                  ? 'bg-surface-2 border-l-primary'
                  : 'border-l-transparent hover:bg-surface-2/60',
              )}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] text-foreground truncate">{s.label}</span>
                  <span className="text-[10px] uppercase tracking-wider text-foreground-subtle font-mono">
                    {CATEGORY_LABEL[s.category]}
                  </span>
                </div>
                <code className="text-[10px] font-mono text-foreground-subtle truncate block">
                  {s.insert.replace(/\$\|/g, '|').replace(/\n/g, '↵')}
                </code>
              </div>
              <div
                className="shrink-0 text-foreground-muted text-[12px] leading-tight prose prose-sm prose-invert max-w-[140px] prose-p:my-0"
                aria-hidden="true"
                dangerouslySetInnerHTML={{ __html: renderMarkdownWithMath(s.preview) }}
              />
            </button>
          );
        })
      )}
    </div>,
    document.body,
  );
}
