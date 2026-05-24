'use client';

import { useEffect, useMemo, useRef } from 'react';
import {
  BookOpen,
  FileText,
  MessageSquare,
  Lightbulb,
  Quote,
  Search,
} from 'lucide-react';
import { cn } from '@/lib/cn';

export type UniversalMenuAction =
  | 'stage-card'
  | 'stage-cornell'
  | 'stage-coach'
  | 'explain'
  | 'define'
  | 'quote-link';

export interface UniversalMenuProps {
  open:      boolean;
  rect:      DOMRect | null;
  text:      string;
  /** Filters which actions appear — Coach surface gets a subset. */
  variant?:  'full' | 'coach' | 'pdf';
  onAction:  (action: UniversalMenuAction, text: string) => void;
  onDismiss: () => void;
}

interface ActionDef {
  id:       UniversalMenuAction;
  label:    string;
  shortcut?: string;
  Icon:     typeof BookOpen;
}

const ALL_ACTIONS: ActionDef[] = [
  { id: 'stage-card',    label: 'Add to Flashcards', shortcut: '⌘⇧L', Icon: BookOpen },
  { id: 'stage-cornell', label: 'Add to Cornell',    shortcut: '⌘⇧K', Icon: FileText },
  { id: 'stage-coach',   label: 'Ask Smart Coach',                     Icon: MessageSquare },
  { id: 'explain',       label: 'Explain',                              Icon: Lightbulb },
  { id: 'define',        label: 'Define',                               Icon: Search },
  { id: 'quote-link',    label: 'Quote-link',                           Icon: Quote },
];

const COACH_ACTIONS: UniversalMenuAction[] = ['stage-card', 'stage-cornell', 'quote-link'];

export function UniversalContextMenu({
  open, rect, text, variant = 'full', onAction, onDismiss,
}: UniversalMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  const actions = useMemo<ActionDef[]>(() => {
    if (variant === 'coach') {
      return ALL_ACTIONS.filter(a => COACH_ACTIONS.includes(a.id));
    }
    return ALL_ACTIONS;
  }, [variant]);

  // Dismiss on outside click + Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onDismiss();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onDismiss(); }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onDismiss]);

  if (!open || !rect || !text) return null;

  // Anchor above the selection midpoint, leaving enough room beneath us for
  // the TipTap formatting BubbleMenu (which sits at rect.top - 44 and is
  // roughly 36px tall). Falls under the selection if there's no room above.
  const MENU_HEIGHT_ESTIMATE = 40;
  const MENU_WIDTH_ESTIMATE  = 480;
  const VIEWPORT_PAD         = 8;
  // Reserve ~50px for the BubbleMenu directly above the selection.
  const BUBBLE_RESERVE       = 50;

  const midX = rect.left + rect.width / 2;
  const aboveY = rect.top - MENU_HEIGHT_ESTIMATE - BUBBLE_RESERVE;
  // When below, drop past the BubbleMenu's "below" fallback position too.
  const belowY = rect.bottom + BUBBLE_RESERVE;
  const top = aboveY >= VIEWPORT_PAD ? aboveY : belowY;
  let left = midX - MENU_WIDTH_ESTIMATE / 2;
  const maxLeft = window.innerWidth - MENU_WIDTH_ESTIMATE - VIEWPORT_PAD;
  if (left < VIEWPORT_PAD) left = VIEWPORT_PAD;
  else if (left > maxLeft) left = Math.max(VIEWPORT_PAD, maxLeft);

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label="Selection actions"
      className={cn(
        'fixed z-50 flex items-center gap-0.5 rounded-lg border border-border bg-background shadow-lg p-1',
      )}
      style={{ left, top }}
      // Prevent the host editor / PDF page from losing selection focus when
      // the user mouses down on the menu.
      onMouseDown={e => e.preventDefault()}
    >
      {actions.map(({ id, label, shortcut, Icon }) => (
        <button
          key={id}
          type="button"
          role="menuitem"
          // preventDefault on mouseDown so the focused editor keeps its
          // selection / caret while the click resolves on this button.
          onMouseDown={e => e.preventDefault()}
          onClick={() => { onAction(id, text); onDismiss(); }}
          className={cn(
            'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-foreground',
            'hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring cursor-pointer',
            'whitespace-nowrap',
          )}
          aria-keyshortcuts={shortcut}
        >
          <Icon className="h-3.5 w-3.5 text-foreground-muted" aria-hidden="true" />
          {label}
          {shortcut && (
            <span className="ml-1 font-mono text-[10px] text-foreground-subtle">
              {shortcut}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
