'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import katex from 'katex';
import { cn } from '@/lib/cn';
import { useTextareaSlashMenu } from '@/hooks/useTextareaSlashMenu';
import { TextareaSlashMenu } from './TextareaSlashMenu';

// React-backed NodeView for the block-level math node. Two display modes:
//   * Rendered KaTeX (default) — single click selects the atom, double-click
//     swaps in the editor.
//   * Editor — a `<textarea>` wired to `useTextareaSlashMenu`, so typing `/`
//     surfaces bare-math snippets (no outer `$…$` wrappers) filtered to the
//     `math-bare` catalog category.

function renderBlockMath(source: string): { html: string; error: string } {
  try {
    return {
      html: katex.renderToString(source, {
        throwOnError: false,
        displayMode: true,
        errorColor: 'hsl(var(--danger))',
      }),
      error: '',
    };
  } catch (e) {
    return { html: '', error: (e as Error).message };
  }
}

export function MathBlockNodeView({
  node,
  editor,
  getPos,
  selected,
  updateAttributes,
  deleteNode,
}: NodeViewProps): JSX.Element {
  const source = String(node.attrs.source ?? '');
  const [editing, setEditing] = useState<boolean>(!source);
  const [draft, setDraft] = useState<string>(source);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Slash menu — math-bare snippets only (no outer `$…$` since we're already
  // inside a math context).
  const slash = useTextareaSlashMenu({
    value: draft,
    setValue: setDraft,
    textareaRef,
  });

  const moveCursorAfter = useCallback(() => {
    if (typeof getPos !== 'function') return;
    const pos = getPos();
    if (typeof pos !== 'number') return;
    const cur = editor.state.doc.nodeAt(pos);
    if (!cur) return;
    const afterPos = pos + cur.nodeSize;
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
  }, [editor, getPos]);

  const commit = useCallback(() => {
    const value = draft.trim();
    if (!value) {
      deleteNode();
      return;
    }
    updateAttributes({ source: value });
    setEditing(false);
    moveCursorAfter();
  }, [draft, updateAttributes, deleteNode, moveCursorAfter]);

  const cancel = useCallback(() => {
    setDraft(source);
    setEditing(false);
  }, [source]);

  const openEditor = useCallback(() => {
    setDraft(source);
    setEditing(true);
  }, [source]);

  // Single click while NOT editing → NodeSelection (ring + native Backspace).
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (editing) return;
      if (typeof getPos !== 'function') return;
      const pos = getPos();
      if (typeof pos !== 'number') return;
      e.preventDefault();
      editor.chain().focus().setNodeSelection(pos).run();
    },
    [editor, getPos, editing],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Let the slash menu claim ↑↓ Enter Tab Esc when open.
      if (slash.onKeyDown(e)) return;
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        commit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancel();
      } else if (e.key === 'Backspace' && draft === '') {
        e.preventDefault();
        deleteNode();
      }
    },
    [slash, commit, cancel, deleteNode, draft],
  );

  // Focus + select the existing source when entering edit mode.
  useEffect(() => {
    if (!editing) return;
    queueMicrotask(() => {
      const ta = textareaRef.current;
      if (!ta) return;
      ta.focus();
      ta.setSelectionRange(0, ta.value.length);
    });
  }, [editing]);

  const { html, error } = renderBlockMath(source);

  return (
    <NodeViewWrapper
      as="div"
      className={cn(
        'math-block group relative my-1 cursor-pointer rounded py-2 text-center ring-1 ring-transparent transition-shadow',
        selected && !editing && 'ring-2 ring-[hsl(var(--focus-ring))]',
        !editing && 'hover:bg-[hsl(var(--surface-2))]',
      )}
      onClick={handleClick}
      onDoubleClick={(e: React.MouseEvent) => {
        if (editing) return;
        e.preventDefault();
        e.stopPropagation();
        openEditor();
      }}
    >
      {editing ? (
        <>
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={e => {
              setDraft(e.target.value);
              slash.onTextChange(e.target.value, e.target.selectionStart);
            }}
            onKeyDown={handleKeyDown}
            onBlur={() => {
              // Don't commit if the blur came from clicking the slash menu.
              if (slash.open) return;
              commit();
            }}
            placeholder="Type LaTeX or press '/' for snippets — e.g. \frac{a}{b}"
            rows={Math.max(1, draft.split('\n').length)}
            className="w-full resize-none rounded border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 py-1 font-mono text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--focus-ring))]"
          />
          <TextareaSlashMenu {...slash.menuProps} categories={['math-bare']} />
        </>
      ) : !source ? (
        <span className="italic text-sm text-[hsl(var(--foreground-subtle))]">
          Empty math block — click to edit
        </span>
      ) : error ? (
        <span className="font-mono text-sm text-[hsl(var(--danger))]" title={error}>
          {source}
        </span>
      ) : (
        // KaTeX HTML — safe to inject (we render it ourselves).
        // eslint-disable-next-line react/no-danger
        <span dangerouslySetInnerHTML={{ __html: html }} />
      )}
    </NodeViewWrapper>
  );
}
