'use client';

import { useEffect, useRef } from 'react';

function isInputFocused(): boolean {
  const active = document.activeElement;
  if (!active) return false;
  return (
    active.tagName === 'INPUT' ||
    active.tagName === 'TEXTAREA' ||
    (active as HTMLElement).contentEditable === 'true'
  );
}

function matchesShortcut(event: KeyboardEvent, shortcut: string): boolean {
  const parts = shortcut.split('+');
  const requiresMeta = parts.includes('meta');
  const requiresShift = parts.includes('shift');
  const key = parts[parts.length - 1];

  // Cross-platform: 'meta' means Cmd on Mac, Ctrl on Windows/Linux
  if (requiresMeta && !(event.metaKey || event.ctrlKey)) return false;
  if (requiresShift && !event.shiftKey) return false;
  // Block single-key shortcuts when a modifier is held (prevents e.g. Ctrl+F triggering 'f')
  if (!requiresMeta && (event.metaKey || event.ctrlKey)) return false;
  return event.key.toLowerCase() === key.toLowerCase() || event.key === key;
}

export function useShortcut(
  shortcut: string,
  callback: () => void,
  options: { allowInInput?: boolean } = {}
): void {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  const { allowInInput } = options;

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!allowInInput && isInputFocused()) return;
      if (matchesShortcut(event, shortcut)) {
        event.preventDefault();
        callbackRef.current();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [shortcut, allowInInput]); // eslint-disable-line react-hooks/exhaustive-deps
}
