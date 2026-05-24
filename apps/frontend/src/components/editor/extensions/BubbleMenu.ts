// Selection-driven bubble menu plugin. Same shape as SlashCommand and
// BlockGutter: no UI here, just emit selection state to a React callback.
//
// Fires:
//   - on every transaction that changes selection size or range
//   - hides when selection is empty / collapsed
//   - hides when the active selection is inside a code block (avoid covering
//     code with floating UI)

import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, NodeSelection } from '@tiptap/pm/state';

export interface BubbleMenuState {
  visible: boolean;
  from: number;
  to: number;
  text: string;
  rect: { top: number; bottom: number; left: number; right: number } | null;
  /** Lets the popup ask which marks are currently active without owning an
   * editor ref. */
  isActive: {
    bold: boolean;
    italic: boolean;
    underline: boolean;
    strike: boolean;
    code: boolean;
    highlight: boolean;
    link: boolean;
  };
}

export interface BubbleMenuOptions {
  onState: (state: BubbleMenuState | null) => void;
}

const BUBBLE_MENU_KEY = new PluginKey('bubbleMenu');

export const BubbleMenu = Extension.create<BubbleMenuOptions>({
  name: 'bubbleMenu',

  addOptions() {
    return { onState: () => {} };
  },

  addProseMirrorPlugins() {
    const onState = this.options.onState;
    const editor = this.editor;

    return [
      new Plugin({
        key: BUBBLE_MENU_KEY,
        view: () => ({
          update(view, prevState) {
            const { state } = view;
            const { selection } = state;
            const sameSelection =
              prevState && prevState.selection.eq(selection);
            const sameDoc = prevState && prevState.doc.eq(state.doc);
            if (sameSelection && sameDoc) return;

            if (selection.empty || selection.from === selection.to) {
              onState(null);
              return;
            }

            // Skip NodeSelections on atom blocks (math, cloze, subpage, image,
            // horizontal rule, etc.) — the marks aren't applicable, and the
            // bubble's `onMouseDown` handlers would otherwise steal clicks
            // landing near the selected block (notably stops link navigation
            // and cursor placement on neighbouring text).
            if (selection instanceof NodeSelection && selection.node.isAtom) {
              onState(null);
              return;
            }

            // Hide inside code / code-block — the bubble would cover the
            // tokens and the marks aren't applicable inside `<code>` anyway.
            const $from = state.doc.resolve(selection.from);
            for (let d = $from.depth; d >= 0; d -= 1) {
              const node = $from.node(d);
              if (node.type.name === 'codeBlock' || node.type.name === 'code') {
                onState(null);
                return;
              }
            }

            // Compute the screen rect that spans the selection. Use the
            // start coords + end coords so the popup hovers above the middle
            // of the highlight, not at one anchor.
            const start = view.coordsAtPos(selection.from);
            const end = view.coordsAtPos(selection.to);
            const left = Math.min(start.left, end.left);
            const right = Math.max(start.right, end.right);
            const top = Math.min(start.top, end.top);
            const bottom = Math.max(start.bottom, end.bottom);
            const text = state.doc.textBetween(selection.from, selection.to, ' ');

            onState({
              visible: true,
              from: selection.from,
              to: selection.to,
              text,
              rect: { top, bottom, left, right },
              isActive: {
                bold: editor.isActive('bold'),
                italic: editor.isActive('italic'),
                underline: editor.isActive('underline'),
                strike: editor.isActive('strike'),
                code: editor.isActive('code'),
                highlight: editor.isActive('highlight'),
                link: editor.isActive('link'),
              },
            });
          },
          destroy() {
            onState(null);
          },
        }),
      }),
    ];
  },
});
