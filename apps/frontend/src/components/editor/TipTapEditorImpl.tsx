'use client';

// KaTeX + highlight.js stylesheets are imported from `app/layout.tsx` so they
// land in the document on first paint, ahead of the lazy-loaded editor chunk.

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  createContext,
} from 'react';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Typography from '@tiptap/extension-typography';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import { useAIStatus } from '@/contexts/AIStatusContext';
import { cn } from '@/lib/cn';
import { AISlashCommandDialog, type NoteAction } from './AISlashCommandDialog';
import { ImageDialog } from './ImageDialog';
import { NoteLinkPicker } from './NoteLinkPicker';
import {
  coerceToTiptapDoc,
  isEmptyTiptapDoc,
} from '@/lib/editor/migrateBlockNoteToTiptap';
import { editorExtensions } from './extensions';
import type { SlashCommandState } from './extensions/SlashCommand';
import type { BlockGutterState } from './extensions/BlockGutter';
import type { BubbleMenuState } from './extensions/BubbleMenu';
import { SlashMenu } from './SlashMenu';
import { BlockGutter } from './BlockGutter';
import { BubbleMenu } from './BubbleMenu';
import {
  UniversalContextMenu,
  type UniversalMenuAction,
} from '@/components/staging/UniversalContextMenu';
import { useStagingContext } from '@/contexts/StagingContext';

// ── Editor session context — lets subpage / cloze NodeViews read setId/noteId ──

export interface EditorSession {
  studySetId?: string;
  currentNoteId?: string;
}

export const EditorSessionContext = createContext<EditorSession>({});

export type TipTapEditorMode =
  | 'note'
  | 'cornell-cue'
  | 'cornell-notes'
  | 'cornell-summary';

export interface TipTapEditorProps {
  /** Content can be either TipTap JSON (new) or BlockNote JSON (legacy). */
  content?: unknown;
  /** Emits TipTap JSON (`{ type: 'doc', content: [...] }`). Debounced 800ms. */
  onChange?: (content: unknown) => void;
  /**
   * Stable callback fired on every ProseMirror selection change. The contract
   * Phase E (Universal Context Menu) consumes — see Plan B task B.7.
   */
  onSelectionChange?: (
    range: { from: number; to: number },
    text: string,
  ) => void;
  readOnly?: boolean;
  placeholder?: string;
  studySetId?: string;
  currentNoteId?: string;
  /** Filters `/page` out of the slash menu (Cornell cue / summary columns). */
  disableSubpage?: boolean;
  /** Filters `/cloze` out of the slash menu (Cornell summary column). */
  disableCloze?: boolean;
  /**
   * Editor's role on screen — drives placeholder defaults and slash-item
   * filtering. Defaults to `'note'`.
   */
  mode?: TipTapEditorMode;
  /** Optional staging hook — when wired, the selection bubble menu surfaces a
   *  "Stage" button that calls this back with the highlighted text + range. */
  onStage?: (
    kind: 'cue' | 'note',
    payload: { text: string; from: number; to: number },
  ) => void;
}

const PLACEHOLDER_BY_MODE: Record<TipTapEditorMode, string> = {
  'note': "Type '/' for commands…",
  'cornell-cue': 'Key questions and cues…',
  'cornell-notes': 'Your notes…',
  'cornell-summary': 'Summarize the key ideas in your own words…',
};

// Stable JSON stringify for echo guard — TipTap emits a fresh object reference
// every keystroke even when the doc is structurally unchanged (initial sync).
function stableStringify(value: unknown): string {
  try {
    return JSON.stringify(value ?? null);
  } catch {
    return '';
  }
}

export function TipTapEditor(props: TipTapEditorProps): JSX.Element {
  const {
    content,
    onChange,
    onSelectionChange,
    readOnly = false,
    placeholder,
    studySetId,
    currentNoteId,
    disableSubpage = false,
    disableCloze = false,
    mode = 'note',
    onStage,
  } = props;

  const { status: aiStatus } = useAIStatus();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastEmittedRef = useRef<string>('');
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onSelectionChangeRef = useRef(onSelectionChange);
  onSelectionChangeRef.current = onSelectionChange;

  // Migrate BlockNote → TipTap once at hydrate.
  const initialDoc = useMemo(() => coerceToTiptapDoc(content), []); // eslint-disable-line react-hooks/exhaustive-deps

  // AI slash command dialog state.
  const [aiDialogOpen, setAiDialogOpen] = useState(false);
  const [aiAction, setAiAction] = useState<NoteAction | null>(null);
  const [aiSelectionText, setAiSelectionText] = useState('');
  const aiInsertPosRef = useRef<{ from: number; to: number } | null>(null);

  // Image dialog state (drives /image slash command).
  const [imageDialogOpen, setImageDialogOpen] = useState(false);

  // Note-link picker state (drives `/link`, `[[`, and Mod-[ flows). The
  // optional strip range is set when the picker was opened via the `[[`
  // input rule — selecting a note then deletes those two brackets so we
  // don't leave them sitting in front of the inserted mention chip.
  const [noteLinkPickerOpen, setNoteLinkPickerOpen] = useState(false);
  const noteLinkStripRangeRef = useRef<{ from: number; to: number } | null>(null);

  // Slash menu state. The extension forwards every onStart/onUpdate/onKeyDown
  // lifecycle event into this setter; <SlashMenu/> reads it and renders.
  const [slashState, setSlashState] = useState<SlashCommandState | null>(null);
  const setSlashStateRef = useRef(setSlashState);
  setSlashStateRef.current = setSlashState;

  // Block gutter state — emitted by the BlockGutter PM plugin on hover, drawn
  // by <BlockGutter/> as a floating `+ / ⋮⋮` next to the hovered block.
  const [gutterState, setGutterState] = useState<BlockGutterState | null>(null);
  const setGutterStateRef = useRef(setGutterState);
  setGutterStateRef.current = setGutterState;

  // Bubble menu state — emitted by the BubbleMenu PM plugin on selection,
  // drawn by <BubbleMenu/> with the formatting toolbar.
  const [bubbleState, setBubbleState] = useState<BubbleMenuState | null>(null);
  const setBubbleStateRef = useRef(setBubbleState);
  setBubbleStateRef.current = setBubbleState;

  // Universal context menu state — anchored to a viewport DOMRect computed
  // from PM's `coordsAtPos`. Mounted independently of <BubbleMenu/> so
  // formatting + staging menus can coexist (BubbleMenu sits closer to text,
  // universal menu floats above with the stage / explain / define actions).
  const [universalMenu, setUniversalMenu] = useState<{
    rect: DOMRect | null;
    text: string;
  }>({ rect: null, text: '' });
  const staging = useStagingContext();

  const aiUnavailable = aiStatus === 'unavailable';
  const placeholderText = placeholder ?? PLACEHOLDER_BY_MODE[mode];

  // The extension's slash-items factory reads from this ref every time the
  // popup opens, so prop changes (AI status flipping, Cornell mode passing
  // disableSubpage, etc.) take effect without needing to rebuild the editor.
  const snapshotRef = useRef({
    studySetId,
    currentNoteId,
    disableSubpage,
    disableCloze,
    mode,
    aiUnavailable,
  });
  snapshotRef.current = {
    studySetId,
    currentNoteId,
    disableSubpage,
    disableCloze,
    mode,
    aiUnavailable,
  };

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: false, // we wire `extension-code-block-lowlight` in B.2 via editorExtensions
        heading: { levels: [1, 2, 3] },
      }),
      Placeholder.configure({ placeholder: placeholderText }),
      Typography,
      // Clicks navigate (open in a new tab); selection-based editing still
      // works via the bubble menu's link editor.
      Link.configure({ openOnClick: true, autolink: true, HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer' } }),
      Image.configure({ inline: false, allowBase64: true }),
      ...editorExtensions({
        getSnapshot: () => ({
          studySetId: snapshotRef.current.studySetId,
          currentNoteId: snapshotRef.current.currentNoteId,
          disableSubpage: snapshotRef.current.disableSubpage,
          disableCloze: snapshotRef.current.disableCloze,
          mode: snapshotRef.current.mode,
          aiUnavailable: snapshotRef.current.aiUnavailable,
        }),
        onSlashState: state => setSlashStateRef.current(state),
        onGutterState: state => setGutterStateRef.current(state),
        onBubbleState: state => setBubbleStateRef.current(state),
      }),
    ],
    content: initialDoc,
    editable: !readOnly,
    editorProps: {
      attributes: {
        class: 'tiptap-editor outline-none focus-visible:outline-none',
        spellcheck: 'true',
      },
    },
    immediatelyRender: false,
    onUpdate({ editor: ed }) {
      if (!onChangeRef.current) return;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null;
        const doc = ed.getJSON();
        lastEmittedRef.current = stableStringify(doc);
        onChangeRef.current?.(doc);
      }, 800);
    },
    onSelectionUpdate({ editor: ed }) {
      const { from, to } = ed.state.selection;
      const text = from === to ? '' : ed.state.doc.textBetween(from, to, ' ').trim();
      onSelectionChangeRef.current?.({ from, to }, text);

      // Update universal menu state. Compute the selection's viewport rect
      // from PM's `coordsAtPos` so the menu floats above the highlight
      // midpoint. Cornell sub-modes (cue / summary) opt out so the menu
      // doesn't fight the narrow gutter columns.
      if (mode === 'cornell-cue' || mode === 'cornell-summary') {
        setUniversalMenu({ rect: null, text: '' });
        return;
      }
      if (!text || from === to) {
        setUniversalMenu({ rect: null, text: '' });
        return;
      }
      try {
        const start = ed.view.coordsAtPos(from);
        const end   = ed.view.coordsAtPos(to);
        const left   = Math.min(start.left, end.left);
        const right  = Math.max(start.right, end.right);
        const top    = Math.min(start.top, end.top);
        const bottom = Math.max(start.bottom, end.bottom);
        const rect = new DOMRect(left, top, right - left, bottom - top);
        setUniversalMenu({ rect, text });
      } catch {
        setUniversalMenu({ rect: null, text: '' });
      }
    },
  });

  // Sync external content changes (server normalization, Tighten Cues apply,
  // second-tab edits). Compare serialized payloads so the echo of our own
  // emits — which arrive back as a fresh object reference but identical
  // structure — doesn't trigger a redundant setContent that would clobber the
  // cursor mid-typing.
  useEffect(() => {
    if (!editor) return;
    const incomingDoc = coerceToTiptapDoc(content);
    const incoming = stableStringify(incomingDoc);
    if (incoming === lastEmittedRef.current) return;
    const current = stableStringify(editor.getJSON());
    if (incoming === current) {
      lastEmittedRef.current = incoming;
      return;
    }
    if (isEmptyTiptapDoc(incomingDoc) && !isEmptyTiptapDoc(editor.getJSON())) {
      // Don't blow away in-progress typing if the parent transiently sent null.
      return;
    }
    try {
      editor.commands.setContent(incomingDoc, false);
      lastEmittedRef.current = incoming;
    } catch {
      // editor not ready yet
    }
  }, [content, editor]);

  // Keep the `editable` flag in sync if readOnly flips.
  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!readOnly);
  }, [editor, readOnly]);

  // Flush pending debounce on unmount so navigating away within the 800ms
  // window doesn't drop the last keystrokes.
  useEffect(() => {
    return () => {
      if (!debounceRef.current) return;
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
      try {
        if (editor) {
          const doc = editor.getJSON();
          lastEmittedRef.current = stableStringify(doc);
          onChangeRef.current?.(doc);
        }
      } catch {
        // editor already torn down
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── AI slash commands ──────────────────────────────────────────────────────

  const openAIDialog = useCallback(
    (action: NoteAction): void => {
      if (!studySetId || aiStatus === 'unavailable' || !editor) return;
      const { from, to, empty } = editor.state.selection;
      const selectedText = empty
        ? ''
        : editor.state.doc.textBetween(from, to, ' ').trim();
      let text = selectedText;
      let target: { from: number; to: number } = { from, to };
      if (!text) {
        // Fall back to the current paragraph's text.
        const $pos = editor.state.doc.resolve(from);
        const blockStart = $pos.start($pos.depth);
        const blockEnd = $pos.end($pos.depth);
        text = editor.state.doc.textBetween(blockStart, blockEnd, ' ').trim();
        target = { from: blockStart, to: blockEnd };
      }
      if (!text) return;
      aiInsertPosRef.current = target;
      setAiAction(action);
      setAiSelectionText(text);
      setAiDialogOpen(true);
    },
    [editor, studySetId, aiStatus],
  );

  const handleAIInsert = useCallback(
    (generated: string): void => {
      if (!editor) return;
      const ref = aiInsertPosRef.current;
      const insertAt = ref ? ref.to : editor.state.doc.content.size;
      editor
        .chain()
        .focus()
        .insertContentAt(insertAt, [
          { type: 'paragraph', content: [{ type: 'text', text: generated }] },
        ])
        .run();
    },
    [editor],
  );

  const handleAIReplace = useCallback(
    (generated: string): void => {
      if (!editor) return;
      const ref = aiInsertPosRef.current;
      if (!ref) {
        handleAIInsert(generated);
        return;
      }
      editor
        .chain()
        .focus()
        .deleteRange({ from: ref.from, to: ref.to })
        .insertContentAt(ref.from, [
          { type: 'paragraph', content: [{ type: 'text', text: generated }] },
        ])
        .run();
    },
    [editor, handleAIInsert],
  );

  // Imperative bridge: any extension (e.g. SlashMenu in B.3) that needs to
  // open the AI dialog can call this via `(editor as any).__openAIDialog`.
  useEffect(() => {
    if (!editor) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (editor as unknown as { __openAIDialog?: (a: NoteAction) => void }).__openAIDialog = openAIDialog;
    return () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (editor as unknown as { __openAIDialog?: (a: NoteAction) => void }).__openAIDialog;
    };
  }, [editor, openAIDialog]);

  // Same imperative bridge for the image dialog — `/image` calls this.
  const openImageDialog = useCallback(() => setImageDialogOpen(true), []);
  useEffect(() => {
    if (!editor) return;
    (editor as unknown as { __openImageDialog?: () => void }).__openImageDialog = openImageDialog;
    return () => {
      delete (editor as unknown as { __openImageDialog?: () => void }).__openImageDialog;
    };
  }, [editor, openImageDialog]);

  const handleImageInsert = useCallback(
    (url: string, alt: string) => {
      if (!editor) return;
      editor
        .chain()
        .focus()
        .setImage({ src: url, alt: alt || undefined })
        .run();
    },
    [editor],
  );

  // Note-link picker bridge.
  const openNoteLinkPicker = useCallback(
    (range?: { from: number; to: number } | null) => {
      noteLinkStripRangeRef.current = range ?? null;
      setNoteLinkPickerOpen(true);
    },
    [],
  );
  useEffect(() => {
    if (!editor) return;
    (editor as unknown as {
      __openNoteLinkPicker?: (range?: { from: number; to: number } | null) => void;
    }).__openNoteLinkPicker = openNoteLinkPicker;
    return () => {
      delete (editor as unknown as {
        __openNoteLinkPicker?: (range?: { from: number; to: number } | null) => void;
      }).__openNoteLinkPicker;
    };
  }, [editor, openNoteLinkPicker]);

  const handleNoteLinkPick = useCallback(
    (note: { _id: string; title: string }) => {
      if (!editor) return;
      const strip = noteLinkStripRangeRef.current;
      let chain = editor.chain().focus();
      if (strip) chain = chain.deleteRange(strip);
      chain
        .insertContent({
          type: 'noteLink',
          attrs: { childNoteId: note._id, childTitle: note.title },
        })
        .insertContent(' ')
        .run();
      noteLinkStripRangeRef.current = null;
    },
    [editor],
  );

  // Boundary for BlockGutter — when the natural "56px left of the block"
  // position would cross outside this element's left edge (e.g. a narrow
  // Cornell cue column), the gutter tucks inside instead of bleeding into
  // the sidebar.
  const editorBoundaryRef = useRef<HTMLDivElement | null>(null);

  const dismissUniversalMenu = useCallback(
    () => setUniversalMenu({ rect: null, text: '' }),
    [],
  );

  const handleUniversalAction = useCallback(
    (action: UniversalMenuAction, text: string) => {
      if (!text.trim()) return;
      if (!studySetId) {
        // Without a study set we can't stage — best effort log; the menu
        // still closes so the user knows the click was acknowledged.
        return;
      }
      const payload = { text, studySetId };
      if (action === 'stage-card')    staging.stage('card', payload);
      else if (action === 'stage-cornell') staging.stage('cornell-row', payload);
      else if (action === 'stage-coach') {
        // Drop the selection straight into the Coach input pill and open the
        // SidePanel on coach mode so the user lands in the textarea.
        staging.pushCoachInput(text);
        staging.onStageHint?.('coach');
      }
      else if (action === 'quote-link' && editor) {
        // Wrap the selection in a blockquote — closest in-editor analogue of
        // "quote-link" before a dedicated quote-mark ships.
        editor.chain().focus().toggleBlockquote().run();
      } else if (action === 'explain' && editor && studySetId) {
        // Reuse the AI dialog with the "explain" prompt.
        const fn = (editor as unknown as { __openAIDialog?: (a: NoteAction) => void }).__openAIDialog;
        fn?.('explain');
      } else if (action === 'define') {
        // Cheap fallback: route to the Coach textarea pre-filled with the
        // selection — real "Define" probably wants a dictionary API but that
        // is out of scope here.
        staging.pushCoachInput(`Define: ${text}`);
        staging.onStageHint?.('coach');
      }
    },
    [editor, staging, studySetId],
  );

  return (
    <EditorSessionContext.Provider value={{ studySetId, currentNoteId }}>
      <AISlashCommandDialog
        action={aiAction}
        text={aiSelectionText}
        studySetId={studySetId}
        open={aiDialogOpen}
        onClose={() => setAiDialogOpen(false)}
        onInsert={handleAIInsert}
        onReplace={handleAIReplace}
      />
      <ImageDialog
        open={imageDialogOpen}
        onClose={() => setImageDialogOpen(false)}
        onInsert={handleImageInsert}
      />
      <NoteLinkPicker
        open={noteLinkPickerOpen}
        onClose={() => {
          setNoteLinkPickerOpen(false);
          noteLinkStripRangeRef.current = null;
        }}
        onPick={handleNoteLinkPick}
        studySetId={studySetId}
        currentNoteId={currentNoteId}
      />
      <div
        ref={editorBoundaryRef}
        className={cn(
          'relative',
          // Narrow Cornell columns don't have a page margin for the gutter to
          // sit in, so the gutter tucks inside the column. Reserve left
          // padding here so the handle doesn't overlap the text.
          (mode === 'cornell-cue' || mode === 'cornell-summary') && 'pl-10',
        )}
      >
        <EditorContent editor={editor} className="tiptap-host" />
      </div>
      <SlashMenu state={slashState} />
      <BlockGutter state={gutterState} editor={editor} boundaryRef={editorBoundaryRef} />
      <BubbleMenu state={bubbleState} editor={editor} onStage={onStage} />
      <UniversalContextMenu
        open={Boolean(universalMenu.rect && universalMenu.text)}
        rect={universalMenu.rect}
        text={universalMenu.text}
        variant="full"
        onAction={handleUniversalAction}
        onDismiss={dismissUniversalMenu}
      />
    </EditorSessionContext.Provider>
  );
}

export type { Editor as TipTapEditorInstance };
