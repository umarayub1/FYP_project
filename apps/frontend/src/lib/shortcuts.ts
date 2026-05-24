import type { Platform } from '@/hooks/usePlatform';

export const SHORTCUTS = {
  COMMAND_PALETTE: 'meta+k',
  SEARCH: 'meta+/',
  TOGGLE_SIDEBAR: 'meta+b',
  TOGGLE_PANEL: 'meta+.',
  FLIP_CARD: 'f',
  ADVANCE_CARD: ' ',
  RATE_AGAIN: '1',
  RATE_HARD: '2',
  RATE_GOOD: '3',
  RATE_EASY: '4',
  CLOSE: 'Escape',
} as const;

export type ShortcutKey = typeof SHORTCUTS[keyof typeof SHORTCUTS];

/** Format a shortcut string for display, adapting modifier symbols to the platform. */
export function formatShortcut(shortcut: string, platform: Platform = 'linux'): string {
  const isMac = platform === 'mac';
  return shortcut
    .replace('meta+', isMac ? '⌘' : 'Ctrl+')
    .replace('shift+', isMac ? '⇧' : 'Shift+')
    .replace('alt+', isMac ? '⌥' : 'Alt+')
    .replace(/^ $/, 'Space')
    .replace(/(^|[+⌘⇧⌥])([a-z])$/, (_, p, c) => p + c.toUpperCase());
}
