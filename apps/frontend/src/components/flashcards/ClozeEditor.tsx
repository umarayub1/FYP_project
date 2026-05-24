'use client';

import { useRef } from 'react';
import { usePlatform } from '@/hooks/usePlatform';
import { cn } from '@/lib/cn';

const CLOZE_COLORS = [
  { bg: 'bg-violet-100 dark:bg-violet-900/40', text: 'text-violet-800 dark:text-violet-200' },
  { bg: 'bg-teal-100 dark:bg-teal-900/40',     text: 'text-teal-800 dark:text-teal-200'   },
  { bg: 'bg-amber-100 dark:bg-amber-900/40',   text: 'text-amber-800 dark:text-amber-200' },
  { bg: 'bg-pink-100 dark:bg-pink-900/40',     text: 'text-pink-800 dark:text-pink-200'   },
];

function getClozeColor(n: number) {
  return CLOZE_COLORS[(n - 1) % CLOZE_COLORS.length];
}

function countClozeGroups(body: string): number {
  const nums = new Set<number>();
  for (const m of body.matchAll(/\{\{c(\d+)::/g)) nums.add(parseInt(m[1]));
  return nums.size;
}

export function renderClozePreview(
  body: string,
  activeCard?: number,
): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const regex = /\{\{c(\d+)::(.*?)\}\}/g;
  let last = 0;
  let key = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(body)) !== null) {
    if (match.index > last) parts.push(body.slice(last, match.index));

    const n = parseInt(match[1]);
    const text = match[2];
    const color = getClozeColor(n);

    if (activeCard !== undefined) {
      if (n === activeCard) {
        parts.push(
          <mark key={key++} className="rounded px-1 bg-surface-3 text-foreground-muted" aria-label="Hidden">
            [...]
          </mark>
        );
      } else {
        parts.push(<span key={key++}>{text}</span>);
      }
    } else {
      parts.push(
        <mark
          key={key++}
          className={cn('rounded px-1 inline-flex items-center gap-0.5', color.bg, color.text)}
          data-cn={n}
        >
          <span className="text-[10px] font-medium opacity-70 select-none" aria-hidden="true">c{n}</span>
          {text}
        </mark>
      );
    }
    last = regex.lastIndex;
  }

  if (last < body.length) parts.push(body.slice(last));
  return parts;
}

interface ClozeEditorProps {
  value: string;
  onChange: (v: string) => void;
}

export function ClozeEditor({ value, onChange }: ClozeEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const platform    = usePlatform();
  const groupCount  = countClozeGroups(value);

  function nextClozeN(): number {
    const nums = new Set<number>();
    for (const m of value.matchAll(/\{\{c(\d+)::/g)) nums.add(parseInt(m[1]));
    let n = 1;
    while (nums.has(n)) n++;
    return n;
  }

  function handleMakeCloze() {
    const ta = textareaRef.current;
    if (!ta || ta.selectionStart === ta.selectionEnd) return;
    const { selectionStart: s, selectionEnd: e } = ta;
    const selected = value.slice(s, e);
    const n = nextClozeN();
    const wrap = `{{c${n}::${selected}}}`;
    const next = value.slice(0, s) + wrap + value.slice(e);
    onChange(next);
    requestAnimationFrame(() => {
      ta.focus();
      const pos = s + wrap.length;
      ta.setSelectionRange(pos, pos);
    });
  }

  function handleRemoveCloze() {
    const ta = textareaRef.current;
    if (!ta) return;
    const pos = ta.selectionStart;
    const regex = /\{\{c\d+::(.*?)\}\}/g;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(value)) !== null) {
      if (m.index <= pos && regex.lastIndex >= pos) {
        const inner = m[1];
        const next = value.slice(0, m.index) + inner + value.slice(regex.lastIndex);
        onChange(next);
        requestAnimationFrame(() => {
          ta.focus();
          ta.setSelectionRange(m!.index, m!.index + inner.length);
        });
        return;
      }
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    const mod = platform === 'mac' ? e.metaKey : e.ctrlKey;
    if (mod && e.shiftKey && e.key.toLowerCase() === 'x') {
      e.preventDefault();
      handleRemoveCloze();
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={handleMakeCloze}
          className="rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring cursor-pointer"
          aria-label={`Wrap selection as cloze c${groupCount + 1}`}
        >
          Make cloze [c{groupCount + 1}]
        </button>
        <button
          type="button"
          onClick={handleRemoveCloze}
          className="rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring cursor-pointer"
          title={`Remove cloze (${platform === 'mac' ? '⌘' : 'Ctrl'}⇧X)`}
          aria-label="Remove cloze at cursor"
        >
          Remove cloze
        </button>
        {groupCount > 0 && (
          <span className="text-xs text-foreground-muted ml-auto" aria-live="polite">
            {groupCount} group{groupCount !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Textarea */}
      <textarea
        ref={textareaRef}
        id="cloze-body"
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-foreground resize-y outline-none focus-visible:ring-2 focus-visible:ring-focus-ring min-h-[100px]"
        placeholder="Type text and select words to make cloze deletions…"
        aria-label="Cloze card body"
        rows={4}
      />

      {/* Color-coded author preview */}
      {value && (
        <div
          className="rounded-md border border-border bg-background px-3 py-2 text-sm leading-relaxed"
          aria-label="Cloze preview"
          aria-live="polite"
        >
          {renderClozePreview(value)}
        </div>
      )}
    </div>
  );
}
