// Global keyboard shortcuts that aren't owned by any single node.
//
// - `Mod+B` / `Mod+I` / `Mod+U` come from StarterKit marks.
// - `Mod+Shift+1..3` heading toggles, also from StarterKit.
// - This extension adds the moves StarterKit does not ship:
//   * `Alt+ArrowUp`   — move the current block up one position.
//   * `Alt+ArrowDown` — move it down.
//   * `Mod+Shift+7`   — toggle bulleted list.
//   * `Mod+Shift+8`   — toggle numbered list.
//   * `Mod+\` / `Mod+/` — toggle inline code on the selection.
//
// The block-move shortcuts walk one position out from the current selection,
// compute the surrounding parent's child index, and swap with the prev/next
// sibling via a ProseMirror `replaceWith` transaction. Works for paragraphs,
// headings, code blocks, math blocks, callouts, subpages, and cloze blocks
// alike — anything that is a direct child of the doc node.

import { Extension } from '@tiptap/core';
import { TextSelection, type Transaction } from '@tiptap/pm/state';

function moveBlock(direction: -1 | 1): ({ editor }: { editor: import('@tiptap/core').Editor }) => boolean {
  return ({ editor }) => {
    const { state, view } = editor;
    const { $from } = state.selection;
    // Find the depth at which we're a direct child of the doc. Most blocks
    // (paragraph, heading, code, math, callout, subpage, cloze) sit at
    // depth 1; if we're nested deeper (list items), bail rather than do the
    // wrong thing — list reorder is handled by StarterKit's own keymap.
    if ($from.depth < 1) return false;
    const blockDepth = 1;
    const parent = $from.node(blockDepth - 1);
    const indexInParent = $from.index(blockDepth - 1);
    const targetIndex = indexInParent + direction;
    if (targetIndex < 0 || targetIndex >= parent.childCount) return false;

    const block = $from.node(blockDepth);
    const sibling = parent.child(targetIndex);
    const blockStart = $from.before(blockDepth);
    const blockEnd = blockStart + block.nodeSize;
    let siblingStart: number;
    if (direction === -1) {
      siblingStart = blockStart - sibling.nodeSize;
    } else {
      siblingStart = blockEnd;
    }
    const siblingEnd = siblingStart + sibling.nodeSize;

    const tr: Transaction = state.tr;
    if (direction === -1) {
      tr.replaceWith(siblingStart, blockEnd, [block, sibling]);
      const newSelPos = siblingStart + 1;
      tr.setSelection(TextSelection.near(tr.doc.resolve(newSelPos)));
    } else {
      tr.replaceWith(blockStart, siblingEnd, [sibling, block]);
      const newSelPos = blockStart + sibling.nodeSize + 1;
      tr.setSelection(TextSelection.near(tr.doc.resolve(newSelPos)));
    }
    view.dispatch(tr.scrollIntoView());
    return true;
  };
}

export const BlockShortcuts = Extension.create({
  name: 'blockShortcuts',

  addKeyboardShortcuts() {
    return {
      'Alt-ArrowUp': moveBlock(-1),
      'Alt-ArrowDown': moveBlock(1),

      'Mod-Shift-7': ({ editor }) => editor.chain().focus().toggleBulletList().run(),
      'Mod-Shift-8': ({ editor }) => editor.chain().focus().toggleOrderedList().run(),
      'Mod-Shift-9': ({ editor }) => editor.chain().focus().toggleBlockquote().run(),

      'Mod-/': ({ editor }) => editor.chain().focus().toggleCode().run(),

      // Mod+Enter on a heading or paragraph exits the current block into a
      // fresh paragraph below — convenient on math/code/callout/subpage.
      'Mod-Enter': ({ editor }) => editor.chain().focus().splitBlock().run(),
    };
  },
});
