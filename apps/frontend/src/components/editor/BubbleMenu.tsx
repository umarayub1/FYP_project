'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Code,
  Highlighter,
  Link as LinkIcon,
  Inbox,
  X,
  Check,
  Trash2,
  type LucideIcon,
} from 'lucide-react';
import type { Editor } from '@tiptap/core';
import type { BubbleMenuState } from './extensions/BubbleMenu';
import { cn } from '@/lib/cn';

interface BubbleMenuProps {
  state: BubbleMenuState | null;
  editor: Editor | null;
  /** Optional staging hook — when present, render a "Stage" button that
   *  surfaces the selection to the host (Cornell columns wire it up). */
  onStage?: (
    kind: 'cue' | 'note',
    payload: { text: string; from: number; to: number },
  ) => void;
}

interface MenuButtonProps {
  label: string;
  shortcut?: string;
  icon: LucideIcon;
  active?: boolean;
  onClick: () => void;
}

function MenuButton({ label, shortcut, icon: Icon, active, onClick }: MenuButtonProps) {
  return (
    <button
      type="button"
      onMouseDown={e => e.preventDefault()}
      onClick={onClick}
      aria-label={label}
      title={shortcut ? `${label} (${shortcut})` : label}
      className={cn(
        'inline-flex h-7 w-7 items-center justify-center rounded transition-colors',
        active
          ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]'
          : 'text-[hsl(var(--foreground-muted))] hover:bg-[hsl(var(--surface-3,var(--surface-2)))] hover:text-[hsl(var(--foreground))]',
      )}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
    </button>
  );
}

type Mode = 'menu' | 'link';

export function BubbleMenu({ state, editor, onStage }: BubbleMenuProps): JSX.Element | null {
  const [mode, setMode] = useState<Mode>('menu');
  const [linkDraft, setLinkDraft] = useState('');
  const linkInputRef = useRef<HTMLInputElement | null>(null);

  // Re-collapse the link editor whenever the selection changes — moving the
  // selection elsewhere implicitly cancels the open-but-not-applied edit.
  useEffect(() => {
    setMode('menu');
  }, [state?.from, state?.to]);

  // Focus + seed the input when the link editor opens.
  useEffect(() => {
    if (mode !== 'link') return;
    queueMicrotask(() => linkInputRef.current?.focus());
  }, [mode]);

  const openLinkEditor = useCallback(() => {
    if (!editor) return;
    const existing = (editor.getAttributes('link').href as string | undefined) ?? '';
    setLinkDraft(existing);
    setMode('link');
  }, [editor]);

  const applyLink = useCallback(() => {
    if (!editor) return;
    const url = linkDraft.trim();
    if (!url) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
    } else {
      editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    }
    setMode('menu');
  }, [editor, linkDraft]);

  const removeLink = useCallback(() => {
    if (!editor) return;
    editor.chain().focus().extendMarkRange('link').unsetLink().run();
    setMode('menu');
  }, [editor]);

  if (!state || !state.visible || !editor || typeof document === 'undefined') return null;

  const rect = state.rect;
  const top = rect ? rect.top - 44 : 100;
  const left = rect ? (rect.left + rect.right) / 2 : 100;

  if (mode === 'link') {
    return createPortal(
      <div
        className="fixed z-[200] flex items-center gap-1 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-1.5 py-1 shadow-lg"
        style={{ top, left, transform: 'translateX(-50%)' }}
        onMouseDown={e => e.preventDefault()}
      >
        <input
          ref={linkInputRef}
          type="url"
          value={linkDraft}
          onChange={e => setLinkDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault();
              applyLink();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              setMode('menu');
            }
          }}
          placeholder="https://example.com"
          className="w-56 rounded-sm border border-transparent bg-transparent px-1.5 py-1 text-xs focus-visible:outline-none focus-visible:border-[hsl(var(--focus-ring))]"
        />
        <button
          type="button"
          onMouseDown={e => e.preventDefault()}
          onClick={applyLink}
          aria-label="Apply link"
          title="Apply (Enter)"
          className="inline-flex h-7 w-7 items-center justify-center rounded text-[hsl(var(--foreground-muted))] hover:bg-[hsl(var(--surface-3,var(--surface-2)))] hover:text-[hsl(var(--foreground))]"
        >
          <Check className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        {state.isActive.link && (
          <button
            type="button"
            onMouseDown={e => e.preventDefault()}
            onClick={removeLink}
            aria-label="Remove link"
            title="Remove link"
            className="inline-flex h-7 w-7 items-center justify-center rounded text-[hsl(var(--foreground-muted))] hover:bg-[hsl(var(--danger-soft))] hover:text-[hsl(var(--danger))]"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        )}
        <button
          type="button"
          onMouseDown={e => e.preventDefault()}
          onClick={() => setMode('menu')}
          aria-label="Cancel"
          title="Cancel (Esc)"
          className="inline-flex h-7 w-7 items-center justify-center rounded text-[hsl(var(--foreground-muted))] hover:bg-[hsl(var(--surface-3,var(--surface-2)))] hover:text-[hsl(var(--foreground))]"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>,
      document.body,
    );
  }

  return createPortal(
    <div
      className="fixed z-[200] flex items-center gap-0.5 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-1 py-0.5 shadow-lg"
      style={{ top, left, transform: 'translateX(-50%)' }}
      onMouseDown={e => e.preventDefault()}
    >
      <MenuButton
        label="Bold"
        shortcut="Mod+B"
        icon={Bold}
        active={state.isActive.bold}
        onClick={() => editor.chain().focus().toggleBold().run()}
      />
      <MenuButton
        label="Italic"
        shortcut="Mod+I"
        icon={Italic}
        active={state.isActive.italic}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      />
      <MenuButton
        label="Underline"
        shortcut="Mod+U"
        icon={UnderlineIcon}
        active={state.isActive.underline}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      />
      <MenuButton
        label="Strikethrough"
        shortcut="Mod+Shift+X"
        icon={Strikethrough}
        active={state.isActive.strike}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      />
      <MenuButton
        label="Inline code"
        shortcut="Mod+E"
        icon={Code}
        active={state.isActive.code}
        onClick={() => editor.chain().focus().toggleCode().run()}
      />
      <div className="mx-0.5 h-5 w-px bg-[hsl(var(--border))]" aria-hidden="true" />
      <MenuButton
        label="Highlight"
        shortcut="Mod+Shift+H"
        icon={Highlighter}
        active={state.isActive.highlight}
        onClick={() => editor.chain().focus().toggleHighlight().run()}
      />
      <MenuButton
        label={state.isActive.link ? 'Edit link' : 'Add link'}
        shortcut="Mod+K"
        icon={LinkIcon}
        active={state.isActive.link}
        onClick={openLinkEditor}
      />
      {onStage && (
        <>
          <div className="mx-0.5 h-5 w-px bg-[hsl(var(--border))]" aria-hidden="true" />
          <MenuButton
            label="Stage selection"
            icon={Inbox}
            onClick={() => onStage('note', { text: state.text, from: state.from, to: state.to })}
          />
        </>
      )}
    </div>,
    document.body,
  );
}
