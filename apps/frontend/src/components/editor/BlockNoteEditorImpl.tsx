'use client';

import { useEffect, useCallback, useRef, useState, createContext, useContext } from 'react';
import Link from 'next/link';
import { useCreateBlockNote } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/mantine';
import {
  SuggestionMenuController,
  getDefaultReactSlashMenuItems,
  SideMenuController,
  SideMenu,
  AddBlockButton,
  createReactBlockSpec,
  createReactInlineContentSpec,
} from '@blocknote/react';
import type { DefaultReactSuggestionItem } from '@blocknote/react';
import {
  BlockNoteSchema,
  defaultBlockSpecs,
  defaultInlineContentSpecs,
  filterSuggestionItems,
} from '@blocknote/core';
import { Extension, nodeInputRule } from '@tiptap/core';
import { useTheme } from 'next-themes';
import { FileText, GripVertical, Sigma, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { useAIStatus } from '@/contexts/AIStatusContext';
import { AISlashCommandDialog, type NoteAction } from './AISlashCommandDialog';
import { createNote } from '@/lib/api/notes';

// ── Editor session context — lets subpage block renderer read setId/noteId ──

interface EditorSession {
  studySetId?: string;
  currentNoteId?: string;
}
const EditorSessionContext = createContext<EditorSession>({});

// ── Inline math (renders $...$ + Space as KaTeX) ──────────────────────────

const MathInlineSpec = createReactInlineContentSpec(
  {
    type: 'mathInline' as const,
    propSchema: { source: { default: '' } },
    content: 'none' as const,
  },
  {
    render: function MathInlineRenderer({ inlineContent }) {
      const source = inlineContent.props.source;
      if (!source) return <span className="text-[hsl(var(--foreground-subtle))]">$</span>;

      let html = '';
      let error = '';
      try {
        html = katex.renderToString(source, { throwOnError: true, displayMode: false });
      } catch (e) {
        error = (e as Error).message;
      }

      if (error) {
        return (
          <span
            className="font-mono text-sm text-[hsl(var(--danger))]"
            title={error}
          >
            ${source}$
          </span>
        );
      }

      return (
        <span
          className="inline-math"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: html }}
        />
      );
    },
  },
);

// TipTap extension: converts $...$ + Space to mathInline node via input rule
const MathInputRuleExtension = Extension.create({
  name: 'mathInputRule',
  addInputRules() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nodeType = (this.editor.schema.nodes as any)['mathInline'];
    if (!nodeType) return [];
    return [
      nodeInputRule({
        find: /\$([^$\n]+)\$(\s)$/,
        type: nodeType,
        getAttributes: (match) => ({ source: match[1] }),
      }),
    ];
  },
});

// ── Math block (renders via /math slash command) ───────────────────────────

const MathBlockSpec = createReactBlockSpec(
  { type: 'math' as const, propSchema: { source: { default: '' } }, content: 'none' as const },
  {
    render: function MathRenderer({ block, editor }) {
      const [editing, setEditing] = useState(!block.props.source);
      const [localSource, setLocalSource] = useState(block.props.source);

      let html = '';
      let renderError = '';
      if (localSource && !editing) {
        try {
          html = katex.renderToString(localSource, { throwOnError: true, displayMode: true });
        } catch (e) {
          renderError = (e as Error).message;
        }
      }

      function commit() {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (editor as unknown as any).updateBlock(block, { props: { source: localSource } });
        setEditing(false);
      }

      if (editing) {
        return (
          <div className="py-2 w-full">
            <input
              type="text"
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
              className="w-full rounded border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 py-1 font-mono text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--focus-ring))]"
              placeholder="Enter LaTeX expression… e.g. x^2 + y^2 = r^2"
              value={localSource}
              onChange={e => setLocalSource(e.target.value)}
              onBlur={commit}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); commit(); }
                if (e.key === 'Escape') { e.preventDefault(); setEditing(false); }
              }}
            />
          </div>
        );
      }

      if (renderError) {
        return (
          <div
            className="cursor-pointer py-2"
            onClick={() => setEditing(true)}
            title={renderError}
          >
            <span className="font-mono text-sm text-[hsl(var(--danger))]">{localSource}</span>
          </div>
        );
      }

      return (
        <div
          className="cursor-pointer py-2 text-center"
          onClick={() => setEditing(true)}
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: html }}
        />
      );
    },
  },
);

// ── Subpage block (created via /page slash command) ───────────────────────

const SubpageBlockSpec = createReactBlockSpec(
  {
    type: 'subpage' as const,
    propSchema: {
      childNoteId: { default: '' },
      childTitle:  { default: 'Untitled' },
    },
    content: 'none' as const,
  },
  {
    render: function SubpageRenderer({ block }) {
      const { studySetId } = useContext(EditorSessionContext);
      const { childNoteId, childTitle } = block.props;

      if (!studySetId || !childNoteId) {
        return (
          <div className="flex items-center gap-2 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] px-3 py-2 text-sm text-[hsl(var(--foreground-muted))]">
            <FileText className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="font-medium">{childTitle || 'Untitled'}</span>
          </div>
        );
      }

      return (
        <Link
          href={`/sets/${studySetId}/notes/${childNoteId}`}
          className="flex items-center gap-2 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] px-3 py-2 text-sm text-foreground hover:bg-[hsl(var(--surface-3))] transition-colors"
          title="Open subpage"
        >
          <FileText className="h-4 w-4 shrink-0 text-[hsl(var(--foreground-subtle))]" aria-hidden="true" />
          <span className="font-medium hover:underline">{childTitle || 'Untitled'}</span>
        </Link>
      );
    },
  },
);

// ── Schema ─────────────────────────────────────────────────────────────────

const editorSchema = BlockNoteSchema.create({
  blockSpecs: { ...defaultBlockSpecs, math: MathBlockSpec, subpage: SubpageBlockSpec },
  inlineContentSpecs: {
    ...defaultInlineContentSpecs,
    mathInline: MathInlineSpec,
  },
});

// ── Types ──────────────────────────────────────────────────────────────────

interface BlockNoteEditorProps {
  content?: unknown;
  onChange?: (content: unknown) => void;
  readOnly?: boolean;
  placeholder?: string;
  studySetId?: string;
  currentNoteId?: string;
  disableSubpage?: boolean;
}

// ── Component ──────────────────────────────────────────────────────────────

export function BlockNoteEditor({
  content,
  onChange,
  readOnly = false,
  placeholder,
  studySetId,
  currentNoteId,
  disableSubpage = false,
}: BlockNoteEditorProps) {
  const { resolvedTheme } = useTheme();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastEmittedRef = useRef<string>(JSON.stringify(content ?? null));
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const { status: aiStatus } = useAIStatus();

  // AI slash command dialog state
  const [aiDialogOpen, setAiDialogOpen]   = useState(false);
  const [aiAction, setAiAction]           = useState<NoteAction | null>(null);
  const [aiSelectionText, setAiSelectionText] = useState('');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const aiTargetBlockRef = useRef<any>(null);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const editor = useCreateBlockNote({
    schema: editorSchema,
    initialContent: content as Parameters<typeof useCreateBlockNote>[0] extends { initialContent?: infer T } ? T : never,
    placeholders: { default: placeholder ?? "Type '/' for commands…" },
    _tiptapOptions: { extensions: [MathInputRuleExtension] },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);

  const handleChange = useCallback(() => {
    if (!onChangeRef.current) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      const doc = editor.document;
      lastEmittedRef.current = JSON.stringify(doc);
      onChangeRef.current?.(doc);
    }, 800);
  }, [editor]);

  // Sync external content changes (server normalization, Tighten Cues apply,
  // second-tab edits). Compare serialized payloads so the echo of our own
  // emits — which arrive back as a fresh array reference but identical
  // structure — doesn't trigger a redundant replaceBlocks that would clobber
  // the cursor mid-typing.
  useEffect(() => {
    const incoming = JSON.stringify(content ?? null);
    if (incoming === lastEmittedRef.current) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ed = editor as unknown as any;
    const current = JSON.stringify(ed.document);
    if (incoming === current) {
      lastEmittedRef.current = incoming;
      return;
    }
    if (!Array.isArray(content) || content.length === 0) return;
    try {
      ed.replaceBlocks(ed.document, content);
      lastEmittedRef.current = incoming;
    } catch {
      // editor not ready yet
    }
  }, [content, editor]);

  // Keyboard DnD: Space picks up focused block, Arrow Up/Down moves it,
  // Space/Esc drops. Scoped via React onKeyDown on the editor wrapper so each
  // editor only responds when focus is inside it — otherwise three Cornell
  // editors all toggle drag mode on one keypress.
  const keyDndRef = useRef<{ active: boolean }>({ active: false });

  function handleEditorKeyDown(e: React.KeyboardEvent<HTMLDivElement>): void {
    const target = e.target as HTMLElement;
    const inText =
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.isContentEditable;
    if (inText) return;

    const dnd = keyDndRef.current;

    if (e.key === ' ' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      dnd.active = !dnd.active;
      return;
    }

    if (!dnd.active) return;
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (editor as unknown as any).moveBlocksUp?.();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (editor as unknown as any).moveBlocksDown?.();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      dnd.active = false;
    }
  }

  useEffect(() => {
    return () => {
      // Flush pending edits before unmount so navigating away within the
      // debounce window doesn't silently drop the last keystrokes.
      if (!debounceRef.current) return;
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
      try {
        const doc = editor.document;
        lastEmittedRef.current = JSON.stringify(doc);
        onChangeRef.current?.(doc);
      } catch {
        // editor already torn down
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── AI slash commands ───────────────────────────────────────────────────

  function extractBlockText(block: unknown): string {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b = block as any;
    if (!Array.isArray(b?.content)) return '';
    return b.content
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((c: any) => c?.type === 'text')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((c: any) => c.text ?? '')
      .join('');
  }

  function openAIDialog(action: NoteAction): void {
    if (!studySetId || aiStatus === 'unavailable') return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ed = editor as unknown as any;
    const sel = ed.getSelection?.();
    const selectedText = typeof sel?.getSelectedText === 'function'
      ? (sel.getSelectedText() as string)
      : '';
    const cursor = ed.getTextCursorPosition?.();
    const block = cursor?.block ?? ed.document?.[0];
    if (!block) return;
    const text = selectedText.trim() || extractBlockText(block).trim();
    if (!text) return;
    aiTargetBlockRef.current = block;
    setAiAction(action);
    setAiSelectionText(text);
    setAiDialogOpen(true);
  }

  function handleAIInsert(generated: string): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ed = editor as unknown as any;
    const ref = aiTargetBlockRef.current ?? ed.document?.[0];
    if (!ref) return;
    ed.insertBlocks(
      [{ type: 'paragraph', content: [{ type: 'text', text: generated, styles: {} }] }],
      ref,
      'after',
    );
  }

  function handleAIReplace(generated: string): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ed = editor as unknown as any;
    const ref = aiTargetBlockRef.current;
    if (!ref) { handleAIInsert(generated); return; }
    ed.updateBlock(ref, {
      content: [{ type: 'text', text: generated, styles: {} }],
    });
  }

  function makeAIItem(
    title: string,
    aliases: string[],
    action: NoteAction,
  ): DefaultReactSuggestionItem {
    const aiDisabled = !studySetId || aiStatus === 'unavailable';
    return {
      title,
      aliases,
      group: 'AI',
      icon: <Sparkles className="h-4 w-4" aria-hidden="true" />,
      subtext: aiDisabled
        ? aiStatus === 'unavailable' ? 'AI unavailable — Dumb Mode' : 'AI features are paused.'
        : 'Insert AI-generated content',
      badge: aiDisabled ? 'Unavailable' : 'AI',
      onItemClick: () => {
        if (aiDisabled) return;
        openAIDialog(action);
      },
    };
  }

  const aiItems: DefaultReactSuggestionItem[] = [
    makeAIItem('/ai-summarize',  ['ai-summarize', 'summarize', 'summary'],         'summarize'),
    makeAIItem('/ai-explain',    ['ai-explain', 'explain', 'definition'],          'explain'),
    makeAIItem('/ai-key-points', ['ai-key-points', 'key points', 'keypoints', 'keys'], 'key-points'),
  ];

  const mathItem: DefaultReactSuggestionItem = {
    title: '/math',
    aliases: ['math', 'latex', 'equation', 'formula'],
    group: 'Math',
    icon: <Sigma className="h-4 w-4" aria-hidden="true" />,
    subtext: 'Insert a centered math equation block (KaTeX)',
    onItemClick: () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ed = editor as unknown as any;
      const cursor = ed.getTextCursorPosition?.();
      const ref = cursor?.block ?? ed.document?.[0];
      if (!ref) return;
      ed.insertBlocks([{ type: 'math', props: { source: '' } }], ref, 'after');
    },
  };

  const pageItem: DefaultReactSuggestionItem = {
    title: 'Subpage',
    aliases: ['page', 'subpage', 'newpage'],
    group: 'Pages',
    icon: <FileText className="h-4 w-4" aria-hidden="true" />,
    subtext: 'Create a new subpage inside this note',
    onItemClick: () => {
      if (!studySetId) return;
      void (async () => {
        try {
          const child = await createNote(studySetId, 'Untitled', currentNoteId);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const ed = editor as unknown as any;
          const cursor = ed.getTextCursorPosition?.();
          const ref = cursor?.block ?? ed.document?.[0];
          if (!ref) return;
          ed.insertBlocks(
            [{ type: 'subpage', props: { childNoteId: child._id, childTitle: child.title } }],
            ref,
            'after',
          );
        } catch {
          toast.error("Couldn't create subpage. Try again.");
        }
      })();
    },
  };

  return (
    <EditorSessionContext.Provider value={{ studySetId, currentNoteId }}>
      <div onKeyDown={handleEditorKeyDown}>
        <AISlashCommandDialog
          action={aiAction}
          text={aiSelectionText}
          studySetId={studySetId}
          open={aiDialogOpen}
          onClose={() => setAiDialogOpen(false)}
          onInsert={handleAIInsert}
          onReplace={handleAIReplace}
        />
        <BlockNoteView
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          editor={editor as any}
          onChange={handleChange}
          editable={!readOnly}
          theme={resolvedTheme === 'dark' ? 'dark' : 'light'}
          slashMenu={false}
          sideMenu={false}
        >
          {/* Custom slash menu: default items + /math + AI + /page (unless disabled) */}
          <SuggestionMenuController
            triggerCharacter="/"
            getItems={async (query) =>
              filterSuggestionItems(
                [
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  ...getDefaultReactSlashMenuItems(editor as any),
                  mathItem,
                  ...aiItems,
                  ...(disableSubpage ? [] : [pageItem]),
                ],
                query,
              )
            }
          />

          {/* Side menu: default "+" add-block button alongside a custom drag handle */}
          <SideMenuController
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            sideMenu={(props: any) => (
              <SideMenu {...props}>
                <AddBlockButton {...props} />
                <div
                  draggable
                  onDragStart={(e) =>
                    props.blockDragStart(
                      { dataTransfer: e.dataTransfer, clientY: e.clientY },
                      props.block,
                    )
                  }
                  onDragEnd={() => props.blockDragEnd?.()}
                  className="flex cursor-grab items-center p-0.5 text-[hsl(var(--foreground-subtle))] hover:text-[hsl(var(--foreground))] active:cursor-grabbing"
                  aria-label="Drag to reorder block. Press Space to pick up with keyboard."
                  title="Drag to reorder"
                >
                  <GripVertical className="h-4 w-4" aria-hidden="true" />
                </div>
              </SideMenu>
            )}
          />
        </BlockNoteView>
      </div>
    </EditorSessionContext.Provider>
  );
}
