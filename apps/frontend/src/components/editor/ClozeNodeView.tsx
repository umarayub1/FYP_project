'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { Brackets, Eye, EyeOff, Trash2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useTextareaSlashMenu } from '@/hooks/useTextareaSlashMenu';
import { TextareaSlashMenu } from './TextareaSlashMenu';

// `body` markdown shape: "The {{c1::cat}} sat on the {{c2::mat}}."
// `c1`, `c2` are cloze groups, each producing one flashcard.

interface ClozeToken {
  kind: 'text' | 'cloze';
  text: string;
  group?: number; // present when kind === 'cloze'
}

// `[^}]*` (zero or more) so empty placeholders like `{{c1::}}` — which is what
// the slash-snippets insert before the user types — still parse as cloze
// tokens. With `+` (one or more) they fell through to literal text and the
// preview showed raw `{{c1::}}` markup.
const CLOZE_RE = /\{\{c(\d+)::([^}]*)\}\}/g;

function parseBody(body: string): ClozeToken[] {
  const tokens: ClozeToken[] = [];
  let last = 0;
  body.replace(CLOZE_RE, (full, num: string, content: string, offset: number) => {
    if (offset > last) tokens.push({ kind: 'text', text: body.slice(last, offset) });
    tokens.push({ kind: 'cloze', text: content, group: Number(num) });
    last = offset + full.length;
    return full;
  });
  if (last < body.length) tokens.push({ kind: 'text', text: body.slice(last) });
  return tokens;
}

function distinctGroups(tokens: ClozeToken[]): number[] {
  const set = new Set<number>();
  for (const t of tokens) if (t.kind === 'cloze' && t.group !== undefined) set.add(t.group);
  return Array.from(set).sort((a, b) => a - b);
}

function nextGroupNumber(body: string): number {
  let max = 0;
  body.replace(CLOZE_RE, (_full, num: string) => {
    const n = Number(num);
    if (n > max) max = n;
    return _full;
  });
  return max + 1;
}

export function ClozeNodeView({ node, updateAttributes, editor, getPos, selected, deleteNode }: NodeViewProps): JSX.Element {
  const body = String(node.attrs.body ?? '');
  const [editing, setEditing] = useState(body.length === 0);
  const [draft, setDraft] = useState(body);
  // Hidden state is persisted on the node itself (`hiddenGroups` attr) so it
  // survives both intra-session remounts and full page reloads via the same
  // autosave path the body text takes.
  const hidden = useMemo<Set<number>>(() => {
    const raw = node.attrs.hiddenGroups;
    if (!Array.isArray(raw)) return new Set();
    return new Set(raw.filter((n): n is number => typeof n === 'number'));
  }, [node.attrs.hiddenGroups]);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Context-aware slash menu — typing `/` inside the cloze textarea opens a
  // picker filtered to cloze patterns. Snippets insert ONLY the structural
  // `{{cN::}}` skeleton (with the cursor parked inside the first blank),
  // leaving the user to fill in their own text.
  const slash = useTextareaSlashMenu({
    value: draft,
    setValue: setDraft,
    textareaRef,
  });

  const tokens = useMemo(() => parseBody(body), [body]);
  const groups = useMemo(() => distinctGroups(tokens), [tokens]);

  const toggleGroup = useCallback(
    (group: number) => {
      const next = new Set(hidden);
      next.has(group) ? next.delete(group) : next.add(group);
      updateAttributes({ hiddenGroups: Array.from(next).sort((a, b) => a - b) });
    },
    [hidden, updateAttributes],
  );

  const revealAll = useCallback(() => {
    updateAttributes({ hiddenGroups: [] });
  }, [updateAttributes]);

  const commit = useCallback(
    (opts?: { moveCursorAfter?: boolean }) => {
      updateAttributes({ body: draft });
      setEditing(false);
      if (!opts?.moveCursorAfter) return;
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
    },
    [draft, updateAttributes, editor, getPos],
  );

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Let the slash menu claim navigation keys first (↑↓ Enter Tab Esc when open).
    if (slash.onKeyDown(e)) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      setDraft(body);
      setEditing(false);
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      commit({ moveCursorAfter: true });
      return;
    }
    // Auto-wrap selection with the next cN group on `{`. Single keypress over
    // a non-empty selection wraps the whole thing as `{{cN::selected}}`,
    // which is the intuitive UX. The previous "wait for the second `{` of
    // `{{`" gate never fired in practice because typing `{` over a selection
    // replaces it (browser default), collapsing the range before the second
    // keystroke arrives.
    if (e.key === '{' && e.shiftKey) {
      const target = e.currentTarget;
      const start = target.selectionStart ?? 0;
      const end = target.selectionEnd ?? 0;
      if (start !== end) {
        e.preventDefault();
        const selected = target.value.slice(start, end);
        const n = nextGroupNumber(target.value);
        const wrapped = `{{c${n}::${selected}}}`;
        const next = target.value.slice(0, start) + wrapped + target.value.slice(end);
        setDraft(next);
        queueMicrotask(() => {
          target.selectionStart = start + wrapped.length;
          target.selectionEnd = start + wrapped.length;
        });
      }
    }
  }

  return (
    <NodeViewWrapper
      as="div"
      className={cn(
        'cloze-block my-1 rounded-md border bg-[hsl(var(--surface))] p-2 transition-shadow',
        selected
          ? 'border-[hsl(var(--focus-ring))] ring-2 ring-[hsl(var(--focus-ring))]'
          : 'border-[hsl(var(--border))]',
      )}
      data-drag-handle
    >
      <div className="mb-1.5 flex items-center gap-2">
        <Brackets className="h-3.5 w-3.5 text-[hsl(var(--foreground-subtle))]" aria-hidden="true" />
        <span className="text-[10px] font-medium uppercase tracking-wider text-[hsl(var(--foreground-subtle))]">
          Cloze
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-1">
          {groups.map(g => {
            const isHidden = hidden.has(g);
            return (
              <button
                key={g}
                type="button"
                onClick={() => toggleGroup(g)}
                className={cn(
                  'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-mono transition-colors',
                  isHidden
                    ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]'
                    : 'bg-[hsl(var(--surface-2))] text-[hsl(var(--foreground-muted))] hover:bg-[hsl(var(--surface-3))]',
                )}
                aria-pressed={isHidden}
                aria-label={`${isHidden ? 'Reveal' : 'Hide'} cloze ${g}`}
              >
                {isHidden ? (
                  <EyeOff className="h-3 w-3" aria-hidden="true" />
                ) : (
                  <Eye className="h-3 w-3" aria-hidden="true" />
                )}
                c{g}
              </button>
            );
          })}
          {hidden.size > 0 && (
            <button
              type="button"
              onClick={revealAll}
              className="rounded px-1.5 py-0.5 text-[10px] text-[hsl(var(--primary))] hover:bg-[hsl(var(--surface-2))]"
            >
              Reveal all
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              if (editing) {
                // Toggling out of edit mode should persist the draft, not
                // discard it.
                commit();
              } else {
                setDraft(body);
                setEditing(true);
              }
            }}
            className="rounded px-1.5 py-0.5 text-[10px] text-[hsl(var(--foreground-muted))] hover:bg-[hsl(var(--surface-2))]"
          >
            {editing ? 'Preview' : 'Edit'}
          </button>
          <button
            type="button"
            onClick={() => deleteNode()}
            className="rounded p-1 text-[hsl(var(--foreground-muted))] hover:bg-[hsl(var(--danger-soft))] hover:text-[hsl(var(--danger))]"
            aria-label="Delete cloze block"
            title="Delete cloze block"
          >
            <Trash2 className="h-3 w-3" aria-hidden="true" />
          </button>
        </div>
      </div>

      {editing ? (
        <>
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={e => {
              setDraft(e.target.value);
              slash.onTextChange(e.target.value, e.target.selectionStart);
            }}
            onBlur={() => {
              // Don't commit if the blur was caused by clicking into the
              // slash menu — that would close it before the click registers.
              if (slash.open) return;
              commit();
            }}
            onKeyDown={handleKeyDown}
            placeholder="Type '/' for cloze patterns, or write your own — e.g. The {{c1::mitochondria}}…"
            className="w-full resize-none rounded border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 py-1.5 font-mono text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--focus-ring))]"
            rows={Math.max(2, draft.split('\n').length)}
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
          />
          <TextareaSlashMenu {...slash.menuProps} categories={['cloze']} />
        </>
      ) : (
        <p className="px-1 py-0.5 text-sm leading-relaxed">
          {tokens.length === 0 ? (
            <span className="italic text-[hsl(var(--foreground-subtle))]">
              Empty cloze — click Edit to add content.
            </span>
          ) : (
            tokens.map((t, i) => {
              if (t.kind === 'text') return <span key={i}>{t.text}</span>;
              const isHidden = t.group !== undefined && hidden.has(t.group);
              const isEmpty = t.text.length === 0;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => t.group !== undefined && toggleGroup(t.group)}
                  className={cn(
                    'mx-px inline-flex items-center rounded px-1 align-baseline text-sm transition-colors',
                    isHidden
                      ? 'bg-[hsl(var(--surface-2))] text-transparent border border-dashed border-[hsl(var(--border))]'
                      : 'bg-[hsl(var(--primary-soft))] text-[hsl(var(--primary))]',
                    isEmpty && !isHidden && 'italic',
                  )}
                  title={`c${t.group}${isEmpty ? ' — empty' : ''}`}
                >
                  {isHidden ? (
                    <span aria-hidden="true">{' '.repeat(Math.max(3, t.text.length))}</span>
                  ) : isEmpty ? (
                    <span className="text-xs opacity-80">c{t.group}</span>
                  ) : (
                    t.text
                  )}
                </button>
              );
            })
          )}
        </p>
      )}
    </NodeViewWrapper>
  );
}
