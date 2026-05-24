// Callout block — `<div data-type="callout" data-variant="info|warning|danger">`
// containing block content. Variant is a node attribute; the renderer applies
// a Tailwind container class and prepends an icon glyph.

import { Node, mergeAttributes, type CommandProps } from '@tiptap/core';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    callout: {
      setCallout: (variant?: 'info' | 'warning' | 'danger') => ReturnType;
      toggleCallout: (variant?: 'info' | 'warning' | 'danger') => ReturnType;
    };
  }
}

export type CalloutVariant = 'info' | 'warning' | 'danger';

const VARIANT_CLASSES: Record<CalloutVariant, string> = {
  info: 'border-[hsl(var(--info))]/40 bg-[hsl(var(--info-soft))]',
  warning: 'border-[hsl(var(--warning))]/40 bg-[hsl(var(--warning-soft))]',
  danger: 'border-[hsl(var(--danger))]/40 bg-[hsl(var(--danger-soft))]',
};

const VARIANT_ICONS: Record<CalloutVariant, string> = {
  info: 'ℹ',
  warning: '⚠',
  danger: '✕',
};

function normalizeVariant(v: unknown): CalloutVariant {
  return v === 'warning' || v === 'danger' ? v : 'info';
}

export interface CalloutOptions {
  HTMLAttributes: Record<string, unknown>;
}

export const Callout = Node.create<CalloutOptions>({
  name: 'callout',
  group: 'block',
  content: 'block+',
  defining: true,

  addOptions() {
    return { HTMLAttributes: {} };
  },

  addAttributes() {
    return {
      variant: {
        default: 'info' as CalloutVariant,
        parseHTML: el =>
          normalizeVariant((el as HTMLElement).getAttribute('data-variant')),
        renderHTML: attrs => ({ 'data-variant': normalizeVariant(attrs.variant) }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="callout"]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const variant = normalizeVariant(node.attrs.variant);
    const className = [
      'callout-block flex gap-3 rounded-md border px-3 py-2 my-1',
      VARIANT_CLASSES[variant],
    ].join(' ');
    return [
      'div',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        'data-type': 'callout',
        class: className,
      }),
      ['span', { class: 'callout-icon shrink-0 select-none mt-0.5', 'aria-hidden': 'true' }, VARIANT_ICONS[variant]],
      ['div', { class: 'callout-body flex-1 min-w-0' }, 0],
    ];
  },

  addCommands() {
    return {
      setCallout:
        (variant = 'info') =>
        ({ commands }: CommandProps) =>
          commands.wrapIn(this.name, { variant: normalizeVariant(variant) }),
      toggleCallout:
        (variant = 'info') =>
        ({ commands }: CommandProps) =>
          commands.toggleWrap(this.name, { variant: normalizeVariant(variant) }),
    };
  },
});
