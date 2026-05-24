// Minimal underline mark — StarterKit doesn't ship one. Renders as `<u>` with
// the obvious decoration. Mod+U toggles it.

import { Mark, mergeAttributes } from '@tiptap/core';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    underline: {
      toggleUnderline: () => ReturnType;
    };
  }
}

export const Underline = Mark.create({
  name: 'underline',

  parseHTML() {
    return [
      { tag: 'u' },
      { style: 'text-decoration', getAttrs: v => /underline/.test(v as string) && null },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['u', mergeAttributes(HTMLAttributes), 0];
  },

  addCommands() {
    return {
      toggleUnderline:
        () =>
        ({ commands }) =>
          commands.toggleMark(this.name),
    };
  },

  addKeyboardShortcuts() {
    return {
      'Mod-u': () => this.editor.commands.toggleUnderline(),
    };
  },
});
