'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import katex from 'katex';
import {
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  ListChecks,
  Code2,
  Quote,
  Minus,
  Sigma,
  Image as ImageIcon,
  Info,
  AlertTriangle,
  AlertCircle,
  FileText,
  Brackets,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import type { SlashCommandState, SlashItem } from './extensions/SlashCommand';
import { cn } from '@/lib/cn';

// Live preview renderers — both memoise off the snippet's source string so we
// only re-render when the source actually changes.
function MathPreview({ source }: { source: string }): JSX.Element {
  const html = useMemo(() => {
    try {
      return katex.renderToString(source, { throwOnError: false, displayMode: false });
    } catch {
      return source;
    }
  }, [source]);
  return (
    <span
      className="inline-block text-sm text-[hsl(var(--foreground))]"
      // KaTeX output is markup we control — safe to inject.
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

const CLOZE_PREVIEW_RE = /\{\{c(\d+)::([^}]+)\}\}/g;

function ClozePreview({ source }: { source: string }): JSX.Element {
  const nodes = useMemo(() => {
    const out: JSX.Element[] = [];
    let last = 0;
    let key = 0;
    source.replace(CLOZE_PREVIEW_RE, (full, _num: string, text: string, offset: number) => {
      if (offset > last) {
        out.push(<span key={key++}>{source.slice(last, offset)}</span>);
      }
      out.push(
        <span
          key={key++}
          className="rounded bg-[hsl(var(--primary-soft))] px-0.5 text-[hsl(var(--primary))]"
        >
          {text}
        </span>,
      );
      last = offset + full.length;
      return full;
    });
    if (last < source.length) out.push(<span key={key++}>{source.slice(last)}</span>);
    return out;
  }, [source]);
  return <span className="text-xs leading-snug text-[hsl(var(--foreground-muted))]">{nodes}</span>;
}

function ItemPreview({ preview }: { preview: NonNullable<SlashItem['preview']> }): JSX.Element {
  return (
    <div className="mt-1 rounded border border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-2 py-1">
      {preview.kind === 'math' ? (
        <MathPreview source={preview.source} />
      ) : (
        <ClozePreview source={preview.source} />
      )}
    </div>
  );
}

const ICONS: Record<string, LucideIcon> = {
  'heading-1': Heading1,
  'heading-2': Heading2,
  'heading-3': Heading3,
  'bullet-list': List,
  'ordered-list': ListOrdered,
  'task-list': ListChecks,
  'code-block': Code2,
  quote: Quote,
  divider: Minus,
  math: Sigma,
  image: ImageIcon,
  'callout-info': Info,
  'callout-warning': AlertTriangle,
  'callout-danger': AlertCircle,
  subpage: FileText,
  cloze: Brackets,
  ai: Sparkles,
};

interface SlashMenuProps {
  state: SlashCommandState | null;
}

interface Position {
  top: number;
  left: number;
  /** When `above`, we anchor by `bottom` instead of `top` so the menu pins
   *  to the line *above* the caret, growing upward as items are added. */
  placement: 'above' | 'below';
}

const MENU_GAP = 4;
const MENU_MAX_HEIGHT = 320; // matches `max-h-80`

export function SlashMenu({ state }: SlashMenuProps): JSX.Element | null {
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<HTMLButtonElement>(null);
  const [position, setPosition] = useState<Position | null>(null);

  const computePosition = useCallback((): Position | null => {
    if (!state) return null;
    const rect = state.getRect();
    if (!rect) return null;
    const viewportH = window.innerHeight;
    const measuredH = containerRef.current?.offsetHeight ?? MENU_MAX_HEIGHT;
    // Flip when there isn't enough room below for the menu. Compare against
    // the rendered height so a half-empty menu uses the smaller footprint and
    // can stay below in cases a full menu would have flipped.
    const spaceBelow = viewportH - rect.bottom;
    const spaceAbove = rect.top;
    const placement: 'above' | 'below' =
      spaceBelow < measuredH + MENU_GAP && spaceAbove > spaceBelow
        ? 'above'
        : 'below';
    const top =
      placement === 'below'
        ? rect.bottom + MENU_GAP
        : Math.max(8, rect.top - MENU_GAP - measuredH);
    const left = Math.min(
      Math.max(8, rect.left),
      window.innerWidth - 296, // menu width 288 + 8px margin
    );
    return { top, left, placement };
  }, [state]);

  // First-paint position. `useLayoutEffect` runs after DOM is committed so
  // `containerRef.current.offsetHeight` is the real rendered height, which
  // matters for accurate `above` placement.
  useLayoutEffect(() => {
    if (!state?.visible) {
      setPosition(null);
      return;
    }
    setPosition(computePosition());
  }, [state?.visible, state?.query, state?.items, state?.selectedIndex, computePosition]);

  // Follow the caret on scroll / resize. Capture-phase scroll listener catches
  // every scrollable ancestor (the route shell, the editor column, modal
  // bodies) without us needing to enumerate them.
  useEffect(() => {
    if (!state?.visible) return;
    const update = () => setPosition(computePosition());
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [state?.visible, computePosition]);

  useEffect(() => {
    if (!selectedRef.current) return;
    selectedRef.current.scrollIntoView({ block: 'nearest' });
  }, [state?.selectedIndex]);

  const grouped = useMemo(() => {
    if (!state) return [] as { group: string; items: { idx: number; item: SlashCommandState['items'][number] }[] }[];
    const byGroup = new Map<string, { idx: number; item: SlashCommandState['items'][number] }[]>();
    state.items.forEach((item, idx) => {
      if (!byGroup.has(item.group)) byGroup.set(item.group, []);
      byGroup.get(item.group)!.push({ idx, item });
    });
    return Array.from(byGroup.entries()).map(([group, items]) => ({ group, items }));
  }, [state]);

  if (!state || !state.visible || typeof document === 'undefined') return null;

  // Position is computed in an effect; on the very first paint we may not
  // have it yet — render off-screen so the layout effect has something to
  // measure without flashing in the corner.
  const top = position?.top ?? -9999;
  const left = position?.left ?? -9999;

  return createPortal(
    <div
      ref={containerRef}
      role="listbox"
      aria-label="Slash command menu"
      className="fixed z-[300] w-72 max-h-80 overflow-y-auto rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] shadow-lg py-1"
      style={{ top, left }}
    >
      {state.items.length === 0 ? (
        <p className="px-3 py-2 text-xs text-[hsl(var(--foreground-subtle))]">
          No matches for &ldquo;{state.query}&rdquo;
        </p>
      ) : (
        grouped.map(({ group, items }) => (
          <div key={group} className="py-1">
            <p className="px-3 py-1 text-[10px] font-medium uppercase tracking-wider text-[hsl(var(--foreground-subtle))]">
              {group}
            </p>
            {items.map(({ idx, item }) => {
              const active = idx === state.selectedIndex;
              const Icon = item.icon ? ICONS[item.icon] : null;
              return (
                <button
                  key={item.id}
                  ref={active ? selectedRef : null}
                  role="option"
                  aria-selected={active}
                  type="button"
                  disabled={item.disabled}
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => state.selectIndex(idx)}
                  className={cn(
                    'flex w-full items-start gap-2 px-3 py-1.5 text-left text-sm transition-colors',
                    active
                      ? 'bg-[hsl(var(--surface-2))] text-[hsl(var(--foreground))]'
                      : 'text-[hsl(var(--foreground-muted))] hover:bg-[hsl(var(--surface-2))]',
                    item.disabled && 'opacity-50 cursor-not-allowed',
                  )}
                >
                  {Icon ? (
                    <Icon className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
                  ) : (
                    <span className="h-4 w-4 shrink-0" aria-hidden="true" />
                  )}
                  <span className="flex-1 min-w-0">
                    <span className="block truncate text-[hsl(var(--foreground))]">
                      {item.title}
                    </span>
                    {item.subtext && (
                      <span className="block truncate text-xs text-[hsl(var(--foreground-subtle))]">
                        {item.subtext}
                      </span>
                    )}
                    {item.preview && <ItemPreview preview={item.preview} />}
                  </span>
                  {item.badge && (
                    <span className="shrink-0 rounded bg-[hsl(var(--surface-2))] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-[hsl(var(--foreground-muted))]">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))
      )}
    </div>,
    document.body,
  );
}
