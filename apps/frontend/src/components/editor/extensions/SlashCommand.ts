// Slash command extension built on `@tiptap/suggestion`.
//
// The extension itself owns no UI — it forwards every `onStart` / `onUpdate` /
// `onKeyDown` / `onExit` lifecycle event into a React state callback wired in
// by the host (`TipTapEditorImpl`). The host renders the actual popup; that
// way arrow/Enter/Escape navigation lives in plain React state rather than
// being awkwardly forced through Suggestion's renderless contract.

import { Extension, type Range } from '@tiptap/core';
import Suggestion, { type SuggestionProps } from '@tiptap/suggestion';
import type { Editor } from '@tiptap/core';

export interface SlashItem {
  id: string;
  title: string;
  /** Free-text aliases — both the title and aliases participate in filtering. */
  aliases?: string[];
  group: string;
  /** Optional one-liner shown under the title in the popup. */
  subtext?: string;
  /** Optional Lucide-like icon component name; the popup resolves it. */
  icon?: string;
  /** Optional right-side badge (e.g. "AI", "Unavailable"). */
  badge?: string;
  /** Disabled items render greyed-out and ignore Enter / click. */
  disabled?: boolean;
  /** Optional live preview rendered inside the row.
   *  - `kind: 'math'` → source is a LaTeX expression; the menu renders it
   *    via KaTeX.
   *  - `kind: 'cloze'` → source is cloze markdown; the menu parses
   *    `{{c1::…}}` groups and highlights them. */
  preview?: { kind: 'math' | 'cloze'; source: string };
  /** Insertion logic. Receives the editor and the range covering `/query`. */
  command: (ctx: { editor: Editor; range: Range }) => void;
}

export interface SlashCommandState {
  visible: boolean;
  query: string;
  items: SlashItem[];
  selectedIndex: number;
  /** Page-relative position (top-left of the trigger glyph). Snapshot taken
   *  at the most recent suggestion lifecycle event — for live tracking on
   *  scroll / resize, the host re-invokes `getRect()`. */
  clientRect: { top: number; bottom: number; left: number; right: number } | null;
  /** Returns the trigger glyph's current viewport rect, or null if it has
   *  scrolled out of the editor / been removed. Use this for live tracking. */
  getRect: () => { top: number; bottom: number; left: number; right: number } | null;
  /** Invoke item N — used by mouse click in the popup. */
  selectIndex: (index: number) => void;
}

export interface SlashCommandOptions {
  /** Stable lookup of every item registered for the current editor. */
  items: () => SlashItem[];
  /** Fired on every state change — host wires this to React `setState`. */
  onState: (state: SlashCommandState | null) => void;
}

function filterItems(items: SlashItem[], query: string): SlashItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter(item => {
    const hay = [item.title, ...(item.aliases ?? [])].join(' ').toLowerCase();
    return hay.includes(q);
  });
}

export const SlashCommand = Extension.create<SlashCommandOptions>({
  name: 'slashCommand',

  addOptions() {
    return {
      items: () => [],
      onState: () => {},
    };
  },

  addProseMirrorPlugins() {
    // Mutable selection cursor — Suggestion fires onStart/onUpdate/onKeyDown
    // independently so we carry it across calls.
    let cursor = { items: [] as SlashItem[], selectedIndex: 0 };
    let lastProps: SuggestionProps<SlashItem> | null = null;

    const emit = (visible: boolean): void => {
      if (!visible || !lastProps) {
        this.options.onState(null);
        return;
      }
      const rect = lastProps.clientRect ? lastProps.clientRect() : null;
      this.options.onState({
        visible: true,
        query: lastProps.query,
        items: cursor.items,
        selectedIndex: cursor.selectedIndex,
        clientRect: rect
          ? { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right }
          : null,
        getRect: () => {
          if (!lastProps || !lastProps.clientRect) return null;
          const r = lastProps.clientRect();
          if (!r) return null;
          return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
        },
        selectIndex: (index: number) => {
          if (!lastProps) return;
          const target = cursor.items[index];
          if (!target || target.disabled) return;
          target.command({ editor: lastProps.editor, range: lastProps.range });
        },
      });
    };

    const refreshItems = (props: SuggestionProps<SlashItem>): void => {
      cursor.items = filterItems(this.options.items(), props.query);
      if (cursor.selectedIndex >= cursor.items.length) cursor.selectedIndex = 0;
    };

    return [
      Suggestion<SlashItem>({
        editor: this.editor,
        char: '/',
        startOfLine: false,
        allowSpaces: false,
        items: ({ query }) => filterItems(this.options.items(), query),
        command: ({ editor, range, props }) => {
          if (!props || props.disabled) return;
          props.command({ editor, range });
        },
        render: () => {
          return {
            onStart: props => {
              lastProps = props;
              cursor = { items: props.items, selectedIndex: 0 };
              emit(true);
            },
            onUpdate: props => {
              lastProps = props;
              refreshItems(props);
              emit(true);
            },
            onKeyDown: props => {
              if (!lastProps) return false;
              const { event } = props;
              if (event.key === 'Escape') {
                emit(false);
                return true;
              }
              if (event.key === 'ArrowDown') {
                if (cursor.items.length === 0) return true;
                cursor.selectedIndex =
                  (cursor.selectedIndex + 1) % cursor.items.length;
                emit(true);
                return true;
              }
              if (event.key === 'ArrowUp') {
                if (cursor.items.length === 0) return true;
                cursor.selectedIndex =
                  (cursor.selectedIndex - 1 + cursor.items.length) %
                  cursor.items.length;
                emit(true);
                return true;
              }
              if (event.key === 'Enter') {
                const target = cursor.items[cursor.selectedIndex];
                if (!target || target.disabled) return true;
                target.command({ editor: lastProps.editor, range: lastProps.range });
                return true;
              }
              return false;
            },
            onExit: () => {
              lastProps = null;
              emit(false);
            },
          };
        },
      }),
    ];
  },
});
