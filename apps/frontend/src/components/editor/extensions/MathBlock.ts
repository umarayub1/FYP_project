// Block-level math node. Atomic, holds a LaTeX source string, rendered as a
// centered KaTeX display-mode block. Can be inserted via:
//   * the `/math` slash item,
//   * typing `$$ ` (double-dollar + space) at the start of a paragraph,
//   * typing `$$` then pressing Enter on a paragraph that only contains it,
//   * typing `$$<expression>$$` inline anywhere — collapses to a block.
//
// Interaction model (matches Notion-ish atom blocks):
//   * Single click on a rendered block → NodeSelection (visual highlight, plus
//     Backspace/Delete and arrow keys act on the atom).
//   * Double click → reopens the LaTeX input.
//   * Empty input + Backspace → deletes the block.
//   * Enter or blur → commits the LaTeX and moves the caret to a paragraph
//     below (auto-inserted if missing).

import { Node, mergeAttributes, InputRule, type CommandProps } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { NodeSelection } from '@tiptap/pm/state';
import { MathBlockNodeView } from '../MathBlockNodeView';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    mathBlock: {
      insertMathBlock: (source?: string) => ReturnType;
    };
  }
}

export interface MathBlockOptions {
  HTMLAttributes: Record<string, unknown>;
}

export const MathBlock = Node.create<MathBlockOptions>({
  name: 'mathBlock',
  group: 'block',
  atom: true,
  selectable: true,

  addOptions() {
    return { HTMLAttributes: {} };
  },

  addAttributes() {
    return {
      source: {
        default: '',
        parseHTML: el => (el as HTMLElement).getAttribute('data-source') ?? '',
        renderHTML: attrs => ({ 'data-source': String(attrs.source ?? '') }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="math-block"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        'data-type': 'math-block',
        class: 'math-block',
      }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(MathBlockNodeView);
  },

  addCommands() {
    return {
      insertMathBlock:
        (source = '') =>
        ({ chain }: CommandProps) =>
          chain()
            .focus()
            .insertContent([
              { type: 'mathBlock', attrs: { source } },
              // Trailing paragraph so the user can escape the atom without
              // hitting the editor's "stuck after an atom" wall.
              { type: 'paragraph' },
            ])
            .run(),
    };
  },

  addInputRules() {
    return [
      // `$$ ` (double-dollar + any whitespace) at the start of a paragraph →
      // empty math block + trailing paragraph.
      new InputRule({
        find: /^\$\$\s$/,
        handler: ({ chain, range }) => {
          chain()
            .deleteRange(range)
            .insertContent([
              { type: 'mathBlock', attrs: { source: '' } },
              { type: 'paragraph' },
            ])
            .run();
        },
      }),
      // `$$<expression>$$` (whole thing typed inline) → block math carrying
      // the expression, plus a trailing paragraph. The negative lookbehind
      // prevents this rule from chewing into a `$$$x$$` triple-dollar.
      new InputRule({
        find: /(?<!\$)\$\$([^$\n]+?)\$\$$/,
        handler: ({ chain, range, match }) => {
          const source = (match[1] ?? '').trim();
          if (!source) return;
          chain()
            .deleteRange(range)
            .insertContent([
              { type: 'mathBlock', attrs: { source } },
              { type: 'paragraph' },
            ])
            .run();
        },
      }),
    ];
  },

  addKeyboardShortcuts() {
    return {
      // Enter on a paragraph whose entire content is `$$` → convert to math.
      Enter: ({ editor }) => {
        const { selection } = editor.state;
        if (!selection.empty) return false;
        const $from = selection.$from;
        const parent = $from.parent;
        if (parent.type.name !== 'paragraph') return false;
        if (parent.textContent !== '$$') return false;
        const start = $from.before();
        const end = $from.after();
        editor
          .chain()
          .focus()
          .deleteRange({ from: start, to: end })
          .insertContentAt(start, [
            { type: 'mathBlock', attrs: { source: '' } },
            { type: 'paragraph' },
          ])
          .run();
        return true;
      },
      // When the math block is node-selected, ArrowDown escapes below.
      ArrowDown: ({ editor }) => exitMathBlock(editor),
    };
  },
});

function exitMathBlock(editor: import('@tiptap/core').Editor): boolean {
  const { selection } = editor.state;
  if (!(selection instanceof NodeSelection)) return false;
  if (selection.node.type.name !== 'mathBlock') return false;
  const afterPos = selection.to;
  const $after = editor.state.doc.resolve(afterPos);
  if ($after.nodeAfter?.type.name === 'paragraph') {
    editor.chain().focus().setTextSelection(afterPos + 1).run();
  } else {
    editor
      .chain()
      .focus()
      .insertContentAt(afterPos, { type: 'paragraph' })
      .setTextSelection(afterPos + 1)
      .run();
  }
  return true;
}
