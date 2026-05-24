// Inline math node — atomic node holding a LaTeX source string, rendered as
// KaTeX HTML via a DOM NodeView. Triggers on `$expr$` followed by any whitespace
// via an input rule. Single-click selects the atom (NodeSelection — gives a
// focus ring and lets Backspace/Delete remove it). Double-click swaps the span
// out for an inline LaTeX input; Enter / blur commit, Escape cancels.

import { Node, mergeAttributes, InputRule, type CommandProps } from '@tiptap/core';
import katex from 'katex';

export interface MathInlineOptions {
  HTMLAttributes: Record<string, unknown>;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    mathInline: {
      insertMathInline: (source: string) => ReturnType;
    };
  }
}

function renderInlineMath(source: string): { html: string; error: string } {
  try {
    return {
      html: katex.renderToString(source, {
        throwOnError: false,
        displayMode: false,
        errorColor: 'hsl(var(--danger))',
      }),
      error: '',
    };
  } catch (e) {
    return { html: '', error: (e as Error).message };
  }
}

export const MathInline = Node.create<MathInlineOptions>({
  name: 'mathInline',
  group: 'inline',
  inline: true,
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
    return [{ tag: 'span[data-type="math-inline"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        'data-type': 'math-inline',
        class: 'inline-math',
      }),
    ];
  },

  addNodeView() {
    return ({ node, editor, getPos }) => {
      const dom = document.createElement('span');
      dom.dataset.type = 'math-inline';
      dom.className = 'inline-math cursor-pointer rounded px-0.5 ring-1 ring-transparent transition-colors hover:bg-[hsl(var(--surface-2))]';

      const input = document.createElement('input');
      input.type = 'text';
      input.className =
        'inline-flex rounded border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-1.5 py-px font-mono text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--focus-ring))]';
      input.style.minWidth = '4ch';

      let committing = false;
      let editing = false;

      function fitInputWidth(): void {
        // Auto-size the inline input to its content so it stays visually
        // unobtrusive — like a chip you can type into.
        const ch = Math.max(input.value.length + 1, 4);
        input.style.width = `${ch}ch`;
      }

      function paint(source: string, asEditing: boolean): void {
        editing = asEditing;
        dom.innerHTML = '';
        if (asEditing) {
          input.value = source;
          dom.appendChild(input);
          fitInputWidth();
          queueMicrotask(() => input.focus());
          return;
        }
        if (!source) {
          dom.textContent = '$$';
          dom.classList.add('font-mono', 'text-sm', 'text-[hsl(var(--foreground-subtle))]');
          dom.removeAttribute('title');
          return;
        }
        dom.classList.remove('font-mono', 'text-sm', 'text-[hsl(var(--foreground-subtle))]');
        const { html, error } = renderInlineMath(source);
        if (error) {
          dom.textContent = source;
          dom.classList.add('font-mono', 'text-sm', 'text-[hsl(var(--danger))]');
          dom.title = error;
        } else {
          dom.removeAttribute('title');
          dom.innerHTML = html;
        }
      }

      function deleteSelf(): void {
        if (typeof getPos !== 'function') return;
        const pos = getPos();
        if (typeof pos !== 'number') return;
        const cur = editor.state.doc.nodeAt(pos);
        if (!cur) return;
        editor.chain().focus().deleteRange({ from: pos, to: pos + cur.nodeSize }).run();
      }

      function commit(): void {
        if (committing) return;
        if (typeof getPos !== 'function') return;
        const pos = getPos();
        if (typeof pos !== 'number') return;
        const value = input.value.trim();
        // Empty value on commit → drop the atom rather than leaving an empty
        // ghost behind.
        if (!value) {
          deleteSelf();
          return;
        }
        committing = true;
        try {
          editor
            .chain()
            .command(({ tr }) => {
              tr.setNodeMarkup(pos, undefined, { source: value });
              return true;
            })
            .run();
          // Always repaint — `setNodeMarkup` with identical attrs is a no-op
          // and `update()` won't fire to swap the <input> back for KaTeX.
          paint(value, false);
          // Move caret just past the atom so the user can keep typing.
          editor.chain().focus().setTextSelection(pos + 1).run();
        } finally {
          committing = false;
        }
      }

      function openEditor(): void {
        if (typeof getPos !== 'function') return;
        const pos = getPos();
        if (typeof pos !== 'number') return;
        // Re-read the current source from the doc — closure `node` goes stale
        // the instant attrs update.
        const cur = editor.state.doc.nodeAt(pos);
        paint(String(cur?.attrs.source ?? ''), true);
      }

      input.addEventListener('input', fitInputWidth);
      input.addEventListener('blur', commit);
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commit();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          if (typeof getPos === 'function') {
            const pos = getPos();
            if (typeof pos === 'number') {
              const cur = editor.state.doc.nodeAt(pos);
              paint(String(cur?.attrs.source ?? ''), false);
            }
          }
        } else if (e.key === 'Backspace' && input.value === '') {
          e.preventDefault();
          deleteSelf();
        }
      });

      // Single click selects the atom (NodeSelection — visible ring + native
      // Backspace/Delete + ArrowKeys work). Double-click opens the editor.
      dom.addEventListener('click', e => {
        if (e.target === input) return;
        if (editing) return;
        if (typeof getPos !== 'function') return;
        const pos = getPos();
        if (typeof pos !== 'number') return;
        e.preventDefault();
        editor.chain().focus().setNodeSelection(pos).run();
      });

      dom.addEventListener('dblclick', e => {
        if (e.target === input) return;
        e.preventDefault();
        e.stopPropagation();
        openEditor();
      });

      paint(String(node.attrs.source ?? ''), !node.attrs.source);

      return {
        dom,
        update(updated) {
          if (updated.type.name !== 'mathInline') return false;
          if (editing && document.activeElement === input) return true;
          paint(String(updated.attrs.source ?? ''), !updated.attrs.source);
          return true;
        },
        selectNode() {
          dom.classList.add('ring-2', 'ring-[hsl(var(--focus-ring))]', 'bg-[hsl(var(--surface-2))]');
          dom.classList.remove('ring-transparent');
        },
        deselectNode() {
          dom.classList.remove('ring-2', 'ring-[hsl(var(--focus-ring))]', 'bg-[hsl(var(--surface-2))]');
          dom.classList.add('ring-transparent');
        },
        stopEvent(event) {
          return event.target === input;
        },
      };
    };
  },

  addCommands() {
    return {
      insertMathInline:
        (source: string) =>
        ({ chain }: CommandProps) =>
          chain()
            .focus()
            .insertContent({ type: 'mathInline', attrs: { source } })
            .run(),
    };
  },

  addInputRules() {
    // `$expr$` → mathInline. The negative lookbehind keeps this from firing
    // mid-`$$expr$$` (when the user has just typed the FIRST closing `$` of
    // a block-math expression, the inner `$x^2$` substring would otherwise
    // get eaten before the block rule has a chance to fire).
    return [
      new InputRule({
        find: /(?<!\$)\$([^$\n]+?)\$$/,
        handler: ({ chain, range, match }) => {
          const source = match[1];
          if (!source) return;
          chain()
            .deleteRange(range)
            .insertContent({ type: 'mathInline', attrs: { source } })
            .run();
        },
      }),
    ];
  },
});
