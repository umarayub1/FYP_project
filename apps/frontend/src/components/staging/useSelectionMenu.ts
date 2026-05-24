'use client';

import { useCallback, useEffect, useRef, useState, RefObject } from 'react';

export interface SelectionState {
  open: boolean;
  rect: DOMRect | null;
  text: string;
}

const EMPTY: SelectionState = { open: false, rect: null, text: '' };

/**
 * Watches `window.getSelection()` inside a host container and exposes an
 * up-to-date `{ open, rect, text }` triple. Hosts render a floating menu
 * anchored to `rect` whenever `open` is true.
 *
 * Modes:
 * - `dom`     — listens for `mouseup` + `selectionchange` (PDF, Coach reply).
 * - `manual`  — caller passes selection ranges into `report({ rect, text })`
 *               (TipTap editor — its `onSelectionChange` callback feeds us
 *               positions in document coords).
 */
export function useSelectionMenu(
  containerRef: RefObject<HTMLElement | null>,
  opts: { mode?: 'dom' | 'manual'; minLength?: number } = {},
): {
  state: SelectionState;
  close:  () => void;
  report: (next: { rect: DOMRect | null; text: string }) => void;
} {
  const { mode = 'dom', minLength = 1 } = opts;
  const [state, setState] = useState<SelectionState>(EMPTY);
  // We hold a soft "menu open" flag so we don't immediately re-close on
  // mouseup inside the menu itself.
  const lockRef = useRef(false);

  const close = useCallback(() => {
    lockRef.current = false;
    setState(EMPTY);
  }, []);

  const report = useCallback((next: { rect: DOMRect | null; text: string }) => {
    if (!next.text || next.text.length < minLength || !next.rect) {
      setState(EMPTY);
      return;
    }
    lockRef.current = true;
    setState({ open: true, rect: next.rect, text: next.text });
  }, [minLength]);

  useEffect(() => {
    if (mode !== 'dom') return;
    const node = containerRef.current;
    if (!node) return;

    function read() {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
        setState(EMPTY);
        return;
      }
      const text = sel.toString().trim();
      if (text.length < minLength) { setState(EMPTY); return; }
      const range = sel.getRangeAt(0);
      const container = node!;
      // Require the selection to be inside this host.
      if (!container.contains(range.commonAncestorContainer)) {
        setState(EMPTY);
        return;
      }
      const rect = range.getBoundingClientRect();
      // Some browsers return a 0×0 rect for collapsed-at-the-end selections.
      if (rect.width < 1 && rect.height < 1) { setState(EMPTY); return; }
      lockRef.current = true;
      setState({ open: true, rect, text });
    }

    function onMouseUp() {
      // Defer to let the browser settle the selection.
      setTimeout(read, 0);
    }

    function onSelectionChange() {
      // Only react if we previously had an open menu (avoids tracking every
      // caret nudge).
      if (!lockRef.current) return;
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) { setState(EMPTY); lockRef.current = false; }
    }

    node.addEventListener('mouseup', onMouseUp);
    document.addEventListener('selectionchange', onSelectionChange);
    return () => {
      node.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('selectionchange', onSelectionChange);
    };
  }, [containerRef, mode, minLength]);

  return { state, close, report };
}
