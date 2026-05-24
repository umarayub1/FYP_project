'use client';

import { useState, useCallback, type RefObject, type KeyboardEvent, type ChangeEvent } from 'react';
import { type Snippet } from '@/lib/editor/snippet-catalog';
import { getCaretCoordinates, placeMenuNearCaret } from '@/lib/editor/caret-coords';

// Approximate menu footprint — overshoot on height so we err toward "flip up"
// when the user types near the bottom of a tall textarea.
const MENU_HEIGHT_PX = 280;
const MENU_WIDTH_PX  = 360;

/**
 * Reusable `/` slash-menu wiring for any plain `<textarea>` Markdown surface.
 *
 * Caller wires three things to its textarea:
 *   - `onChange` → call `onTextChange(value, cursorPos)`
 *   - `onKeyDown` → call `onKeyDown(event)` BEFORE its own handler (it
 *     returns true when it intercepted and the caller should bail)
 *   - render `<TextareaSlashMenu {...menuProps} />` somewhere
 *
 * Caller provides `value` + `setValue` so the hook can rewrite the buffer
 * on snippet insert, and `textareaRef` so we can position the caret.
 */
export interface UseSlashMenuOptions {
  value:        string;
  setValue:     (v: string) => void;
  textareaRef:  RefObject<HTMLTextAreaElement | null>;
  /** Called after a snippet is inserted — typically schedules an evaluate. */
  onAfterInsert?: (newValue: string) => void;
}

function detectMathContext(text: string, pos: number): 'inline' | 'block' | 'none' {
  // Walk the text before `pos` counting `$$`/`$` toggles. Block math is
  // checked first so a single `$` inside an open block doesn't flip inline.
  let inBlock = false;
  let inInline = false;
  let i = 0;
  while (i < pos) {
    if (text[i] === '$' && text[i + 1] === '$') {
      if (!inInline) inBlock = !inBlock;
      i += 2;
    } else if (text[i] === '$' && !inBlock) {
      inInline = !inInline;
      i += 1;
    } else {
      i += 1;
    }
  }
  return inBlock ? 'block' : inInline ? 'inline' : 'none';
}

function stripOuterDollars(insert: string): string {
  if (insert.startsWith('$$\n') && insert.endsWith('\n$$')) return insert.slice(3, -3);
  if (insert.startsWith('$') && insert.endsWith('$') && insert.length >= 2) return insert.slice(1, -1);
  return insert;
}

export function useTextareaSlashMenu(opts: UseSlashMenuOptions) {
  const { value, setValue, textareaRef, onAfterInsert } = opts;

  const [slashStart, setSlashStart]         = useState<number | null>(null);
  const [slashHighlight, setSlashHighlight] = useState(0);
  const [slashResults, setSlashResults]     = useState<Snippet[]>([]);
  const [slashAnchor, setSlashAnchor]       = useState<{ top: number; left: number } | null>(null);

  const closeMenu = useCallback(() => {
    setSlashStart(null);
    setSlashHighlight(0);
    setSlashAnchor(null);
  }, []);

  const computeAnchor = useCallback((slashPos: number) => {
    const ta = textareaRef.current;
    if (!ta) return;
    // Real caret coords via mirror-div technique — the menu opens at the
    // user's cursor, not pinned to the textarea corner. Falls back to the
    // top-left if coords can't be computed (e.g. textarea not laid out yet).
    const caret = getCaretCoordinates(ta, slashPos);
    if (!caret) {
      const r = ta.getBoundingClientRect();
      setSlashAnchor({ top: r.top + 12, left: r.left + 12 });
      return;
    }
    const { top, left } = placeMenuNearCaret(caret, MENU_HEIGHT_PX, MENU_WIDTH_PX);
    setSlashAnchor({ top, left });
  }, [textareaRef]);

  const onTextChange = useCallback((newValue: string, cursorPos: number) => {
    // Open when the cursor sits right after a `/` that's at start-of-word.
    const charBefore = cursorPos > 0 ? newValue[cursorPos - 1] : '';
    if (charBefore === '/') {
      const beforeSlash = cursorPos >= 2 ? newValue[cursorPos - 2] : '';
      const atWordStart = cursorPos === 1 || /\s/.test(beforeSlash);
      if (atWordStart) {
        setSlashStart(cursorPos - 1);
        setSlashHighlight(0);
        computeAnchor(cursorPos - 1);
        return;
      }
    }
    // Already open → keep open unless cursor moved before `/` or a whitespace
    // landed inside the query.
    setSlashStart(prev => {
      if (prev === null) return null;
      const between = newValue.slice(prev + 1, cursorPos);
      if (cursorPos < prev + 1 || /\s/.test(between)) return null;
      return prev;
    });
  }, [computeAnchor]);

  const insertSnippet = useCallback((snippet: Snippet) => {
    const ta = textareaRef.current;
    if (!ta || slashStart === null) return;
    const cursorPos = ta.selectionStart;

    // If the `/` was typed inside an open math expression, strip outer dollars
    // so we don't end up with `$$ $\sum_{}^{} $$`.
    const mathCtx   = detectMathContext(value, slashStart);
    const rawInsert = mathCtx === 'none' ? snippet.insert : stripOuterDollars(snippet.insert);

    // Private Use Area placeholder — won't collide with any real text.
    const MARKER = '';
    const inserted = rawInsert.replace('$|', MARKER);
    const cursorOffset = inserted.indexOf(MARKER);
    const finalInsert  = inserted.replace(MARKER, '');
    const next = value.slice(0, slashStart) + finalInsert + value.slice(cursorPos);

    setValue(next);
    closeMenu();
    onAfterInsert?.(next);

    const newCursor = slashStart + (cursorOffset >= 0 ? cursorOffset : finalInsert.length);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(newCursor, newCursor);
    });
  }, [value, setValue, slashStart, textareaRef, closeMenu, onAfterInsert]);

  const onKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>): boolean => {
    if (slashStart === null) return false;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSlashHighlight(h => slashResults.length === 0 ? 0 : (h + 1) % slashResults.length);
      return true;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSlashHighlight(h => slashResults.length === 0 ? 0 : (h - 1 + slashResults.length) % slashResults.length);
      return true;
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      const sel = slashResults[slashHighlight];
      if (sel) {
        e.preventDefault();
        insertSnippet(sel);
        return true;
      }
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      closeMenu();
      return true;
    }
    return false;
  }, [slashStart, slashResults, slashHighlight, insertSnippet, closeMenu]);

  const slashQuery = slashStart !== null
    ? value.slice(slashStart + 1, textareaRef.current?.selectionStart ?? slashStart + 1)
    : '';

  const onResultsChange = useCallback((rs: Snippet[]) => {
    setSlashResults(rs);
    setSlashHighlight(h => (rs.length === 0 ? 0 : Math.min(h, rs.length - 1)));
  }, []);

  return {
    /** True when the menu is currently open. */
    open: slashStart !== null && slashAnchor !== null,
    /** Spread onto `<TextareaSlashMenu>`. */
    menuProps: {
      open:      slashStart !== null && slashAnchor !== null,
      query:     slashQuery,
      anchor:    slashAnchor ?? { top: 0, left: 0 },
      highlight: slashHighlight,
      onResultsChange,
      onSelect:  insertSnippet,
      onClose:   closeMenu,
    },
    /** Caller wires these to its textarea. */
    onTextChange,
    onKeyDown,
    closeMenu,
  };
}

// Convenience: a wrapper that handles `ChangeEvent` directly for callers
// that don't already compute cursorPos.
export function slashTextareaChangeHandler(
  hookOnTextChange: (value: string, pos: number) => void,
  setValueExternal?: (v: string) => void,
) {
  return (e: ChangeEvent<HTMLTextAreaElement>) => {
    setValueExternal?.(e.target.value);
    hookOnTextChange(e.target.value, e.target.selectionStart);
  };
}
