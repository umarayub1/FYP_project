// Subpage node — ports the Phase 21.5 `subpage` block to TipTap.
//
// Atomic block holding `childNoteId` + `childTitle`. The NodeView renders a
// clickable Notion-style card linking to `/sets/[setId]/notes/[childNoteId]`.
// The `/page` slash item creates the underlying child note and inserts this
// node with the returned id; the create call lives in `slashItems.ts`.

import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { SubpageNodeView } from '../SubpageNodeView';

export interface SubpageOptions {
  HTMLAttributes: Record<string, unknown>;
}

export const Subpage = Node.create<SubpageOptions>({
  name: 'subpage',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

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
    return [{ tag: 'div[data-type="subpage"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        'data-type': 'subpage',
        class: 'subpage-card',
      }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(SubpageNodeView);
  },
});
