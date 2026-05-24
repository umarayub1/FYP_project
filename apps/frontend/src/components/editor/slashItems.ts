// Registry of slash-menu items. Each item is a small command that operates on
// the current selection range (covering the `/` trigger and query). Cornell-
// mode columns pass disable flags that the registry honours by either omitting
// the item (subpage / cloze when not applicable) or marking it disabled (AI
// items when Dumb Mode is on).

import { toast } from 'sonner';
import type { Editor, Range } from '@tiptap/core';
import type { SlashItem } from './extensions/SlashCommand';
import type { TipTapEditorMode } from './TipTapEditorImpl';
import type { NoteAction } from './AISlashCommandDialog';
import { createNote } from '@/lib/api/notes';

function newClozeId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `cz-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export interface SlashItemContext {
  studySetId?: string;
  currentNoteId?: string;
  mode: TipTapEditorMode;
  disableSubpage: boolean;
  disableCloze: boolean;
  aiUnavailable: boolean;
}

function clearTrigger(editor: Editor, range: Range): void {
  editor.chain().focus().deleteRange(range).run();
}

export function buildSlashItems(ctx: SlashItemContext): SlashItem[] {
  const items: SlashItem[] = [];

  // ── Headings ───────────────────────────────────────────────────────────────
  ([1, 2, 3] as const).forEach(level => {
    items.push({
      id: `heading-${level}`,
      title: `Heading ${level}`,
      aliases: [`h${level}`, 'heading', 'title'],
      group: 'Headings',
      icon: `heading-${level}`,
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).setNode('heading', { level }).run();
      },
    });
  });

  // ── Lists ──────────────────────────────────────────────────────────────────
  items.push({
    id: 'bullet-list',
    title: 'Bulleted list',
    aliases: ['ul', 'bullet', 'list'],
    group: 'Lists',
    icon: 'bullet-list',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleBulletList().run();
    },
  });
  items.push({
    id: 'ordered-list',
    title: 'Numbered list',
    aliases: ['ol', 'numbered', 'list', 'ordered'],
    group: 'Lists',
    icon: 'ordered-list',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleOrderedList().run();
    },
  });

  // ── Blocks ─────────────────────────────────────────────────────────────────
  items.push({
    id: 'code-block',
    title: 'Code block',
    aliases: ['code', 'pre', 'snippet'],
    group: 'Blocks',
    icon: 'code-block',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleCodeBlock().run();
    },
  });
  items.push({
    id: 'quote',
    title: 'Quote',
    aliases: ['blockquote', 'quote'],
    group: 'Blocks',
    icon: 'quote',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleBlockquote().run();
    },
  });
  items.push({
    id: 'divider',
    title: 'Divider',
    aliases: ['hr', 'rule', 'divider', 'separator'],
    group: 'Blocks',
    icon: 'divider',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setHorizontalRule().run();
    },
  });

  // ── Callouts ───────────────────────────────────────────────────────────────
  ([
    { id: 'callout-info', title: 'Callout — Info', variant: 'info' as const, icon: 'callout-info' },
    { id: 'callout-warning', title: 'Callout — Warning', variant: 'warning' as const, icon: 'callout-warning' },
    { id: 'callout-danger', title: 'Callout — Danger', variant: 'danger' as const, icon: 'callout-danger' },
  ]).forEach(({ id, title, variant, icon }) => {
    items.push({
      id,
      title,
      aliases: ['callout', variant, 'note', 'tip'],
      group: 'Callouts',
      icon,
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).setCallout(variant).run();
      },
    });
  });

  // ── Math / Image ───────────────────────────────────────────────────────────
  items.push({
    id: 'math-block',
    title: 'Math block',
    aliases: ['math', 'latex', 'equation', 'formula'],
    group: 'Embeds',
    icon: 'math',
    subtext: 'Insert a centered LaTeX block',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).insertMathBlock('').run();
    },
  });
  items.push({
    id: 'image',
    title: 'Image',
    aliases: ['image', 'img', 'picture'],
    group: 'Embeds',
    icon: 'image',
    subtext: 'Insert by URL',
    command: ({ editor, range }) => {
      // Strip the trigger first, then let the host's image dialog drive the
      // actual insert (URL + alt text). The dialog talks back to the editor
      // via the imperative `__openImageDialog` bridge installed in
      // TipTapEditorImpl.
      clearTrigger(editor, range);
      const open = (editor as unknown as { __openImageDialog?: () => void }).__openImageDialog;
      open?.();
    },
  });

  // ── Note link (E1) — inline `[[Note Title]]` mention chip ─────────────────
  items.push({
    id: 'note-link',
    title: 'Link to note',
    aliases: ['link', 'mention', 'reference', 'noteref'],
    group: 'Pages',
    icon: 'subpage',
    subtext: 'Insert an inline link to another note',
    disabled: !ctx.studySetId,
    command: ({ editor, range }) => {
      clearTrigger(editor, range);
      const open = (editor as unknown as { __openNoteLinkPicker?: () => void }).__openNoteLinkPicker;
      open?.();
    },
  });

  // ── Subpage (Phase 21.5 port — gated by disableSubpage) ───────────────────
  if (!ctx.disableSubpage) {
    items.push({
      id: 'subpage',
      title: 'Subpage',
      aliases: ['page', 'subpage', 'newpage'],
      group: 'Pages',
      icon: 'subpage',
      subtext: 'Create a new child note',
      disabled: !ctx.studySetId,
      command: ({ editor, range }) => {
        if (!ctx.studySetId) return;
        clearTrigger(editor, range);
        void (async () => {
          try {
            const child = await createNote(ctx.studySetId!, 'Untitled', ctx.currentNoteId);
            editor
              .chain()
              .focus()
              .insertContent({
                type: 'subpage',
                attrs: { childNoteId: child._id, childTitle: child.title },
              })
              .run();
          } catch {
            toast.error("Couldn't create subpage. Try again.");
          }
        })();
      },
    });
  }

  // ── Cloze deletion (B.5 — gated by disableCloze) ──────────────────────────
  if (!ctx.disableCloze) {
    items.push({
      id: 'cloze',
      title: 'Cloze deletion',
      aliases: ['cloze', 'fill', 'occlusion'],
      group: 'Flashcards',
      icon: 'cloze',
      subtext: 'Hide parts of a sentence with {{c1::…}}',
      command: ({ editor, range }) => {
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .insertContent([
            { type: 'cloze', attrs: { body: '', id: newClozeId() } },
            // Trailing paragraph so cursor has a destination after commit.
            { type: 'paragraph' },
          ])
          .run();
      },
    });

  }

  // ── AI items ───────────────────────────────────────────────────────────────
  const aiSubtext = ctx.aiUnavailable
    ? 'AI unavailable — Dumb Mode'
    : 'Insert AI-generated content';
  const aiBadge = ctx.aiUnavailable ? 'Unavailable' : 'AI';
  ([
    { id: 'ai-summarize', title: '/ai-summarize', action: 'summarize' as NoteAction, aliases: ['summarize', 'summary'] },
    { id: 'ai-explain', title: '/ai-explain', action: 'explain' as NoteAction, aliases: ['explain', 'definition'] },
    { id: 'ai-key-points', title: '/ai-key-points', action: 'key-points' as NoteAction, aliases: ['key points', 'keypoints'] },
  ]).forEach(({ id, title, action, aliases }) => {
    items.push({
      id,
      title,
      aliases,
      group: 'AI',
      icon: 'ai',
      subtext: aiSubtext,
      badge: aiBadge,
      disabled: ctx.aiUnavailable || !ctx.studySetId,
      command: ({ editor, range }) => {
        clearTrigger(editor, range);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const openDialog = (editor as unknown as { __openAIDialog?: (a: NoteAction) => void }).__openAIDialog;
        openDialog?.(action);
      },
    });
  });

  return items;
}
