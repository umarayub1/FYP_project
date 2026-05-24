// Cloze deletion block (FR4.5).
//
// Atomic block. `attrs.body` holds the raw cloze markdown
// (`The {{c1::cat}} sat on the {{c2::mat}}.`). The NodeView renders inline
// previews of each group plus a hide/reveal toolbar. When the user "extracts
// to flashcards", the gateway parses the cN groups and creates N flashcards;
// that parser is shared with Plan A.5 and lives server-side.

import { Node, mergeAttributes } from '@tiptap/core';
import { NodeSelection } from '@tiptap/pm/state';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { ClozeNodeView } from '../ClozeNodeView';

export interface ClozeOptions {
  HTMLAttributes: Record<string, unknown>;
}

export const Cloze = Node.create<ClozeOptions>({
  name: 'cloze',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addOptions() {
    return { HTMLAttributes: {} };
  },

  addAttributes() {
    return {
      body: {
        default: '',
        parseHTML: el => (el as HTMLElement).getAttribute('data-body') ?? '',
        renderHTML: attrs => ({ 'data-body': String(attrs.body ?? '') }),
      },
      // Stable per-block ID. Useful as a debugging handle and as a key for
      // anything that needs a non-positional reference to this block.
      id: {
        default: '',
        parseHTML: el => (el as HTMLElement).getAttribute('data-id') ?? '',
        renderHTML: attrs => ({ 'data-id': String(attrs.id ?? '') }),
      },
      // Hide/reveal state, stored as an array of cN group numbers. Persisted
      // so the user's chosen "what's hidden" survives page reload.
      hiddenGroups: {
        default: [] as number[],
        parseHTML: el => {
          const raw = (el as HTMLElement).getAttribute('data-hidden-groups');
          if (!raw) return [];
          try {
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed)
              ? parsed.filter((n): n is number => typeof n === 'number')
              : [];
          } catch {
            return [];
          }
        },
        renderHTML: attrs => {
          const list = Array.isArray(attrs.hiddenGroups) ? attrs.hiddenGroups : [];
          return list.length > 0 ? { 'data-hidden-groups': JSON.stringify(list) } : {};
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="cloze"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        'data-type': 'cloze',
        class: 'cloze-block',
      }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ClozeNodeView);
  },

  addKeyboardShortcuts() {
    return {
      // When the cloze block is node-selected (clicked once but not opened),
      // ArrowDown / Enter escape into the paragraph below.
      ArrowDown: ({ editor }) => exitCloze(editor),
      Enter: ({ editor }) => exitCloze(editor),
    };
  },
});

function exitCloze(editor: import('@tiptap/core').Editor): boolean {
  const { selection } = editor.state;
  if (!(selection instanceof NodeSelection)) return false;
  if (selection.node.type.name !== 'cloze') return false;
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
