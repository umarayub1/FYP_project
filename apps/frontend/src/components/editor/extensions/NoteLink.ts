// Inline note-link atom — Notion-style `[[Note Title]]` mention chip.
//
// `attrs.childNoteId` is the persistent reference; `attrs.childTitle` is the
// last-known title rendered in the chip (live-resync to come in E2's pass
// once we have the lookup endpoint).
//
// Picker invocation surfaces:
//   * `/link` slash item → strips the trigger, opens the picker.
//   * `[[` input rule → strips the two brackets, opens the picker.
//   * `Mod-[` keyboard shortcut → opens the picker at the caret.
//
// All three call into the host-installed `__openNoteLinkPicker` bridge on
// the editor instance (set up in `TipTapEditorImpl`).

import { Node, mergeAttributes, InputRule } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { NoteLinkNodeView } from '../NoteLinkNodeView';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    noteLink: {
      insertNoteLink: (attrs: { childNoteId: string; childTitle: string }) => ReturnType;
    };
  }
}

export interface NoteLinkOptions {
  HTMLAttributes: Record<string, unknown>;
}

export const NoteLink = Node.create<NoteLinkOptions>({
  name: 'noteLink',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addOptions() {
    return { HTMLAttributes: {} };
  },

  addAttributes() {
    return {
      childNoteId: {
        default: '',
        parseHTML: el => (el as HTMLElement).getAttribute('data-child-note-id') ?? '',
        renderHTML: attrs => ({ 'data-child-note-id': String(attrs.childNoteId ?? '') }),
      },
      childTitle: {
        default: 'Untitled',
        parseHTML: el => (el as HTMLElement).getAttribute('data-child-title') ?? 'Untitled',
        renderHTML: attrs => ({ 'data-child-title': String(attrs.childTitle ?? 'Untitled') }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-type="note-link"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        'data-type': 'note-link',
        class: 'note-link',
      }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(NoteLinkNodeView);
  },

  addCommands() {
    return {
      insertNoteLink:
        attrs =>
        ({ chain }) =>
          chain()
            .focus()
            .insertContent({ type: 'noteLink', attrs })
            .insertContent(' ')
            .run(),
    };
  },

  addInputRules() {
    // Typing `[[` opens the picker. We delete the two brackets right away (no
    // point leaving them in the doc) and remember nothing — the picker's
    // insert just lands at the current cursor.
    const editor = this.editor;
    return [
      new InputRule({
        find: /\[\[$/,
        handler: ({ chain, range }) => {
          chain().deleteRange(range).run();
          const open = (editor as unknown as {
            __openNoteLinkPicker?: (range?: { from: number; to: number } | null) => void;
          }).__openNoteLinkPicker;
          // Run the picker open *after* the deleteRange transaction commits,
          // otherwise React's open-state update can race with the editor's
          // doc update.
          queueMicrotask(() => open?.(null));
        },
      }),
    ];
  },

  addKeyboardShortcuts() {
    return {
      // Mod+[ opens the picker. No range to strip (no `[[` was typed).
      'Mod-[': ({ editor }) => {
        const open = (editor as unknown as { __openNoteLinkPicker?: (range: { from: number; to: number } | null) => void }).__openNoteLinkPicker;
        open?.(null);
        return true;
      },
    };
  },
});
