'use client';

// CSS import here (not inside dynamic chunk) so Next.js extracts it statically.
import '@blocknote/mantine/style.css';
import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';

// ── Switching shim ─────────────────────────────────────────────────────────
//
// Plan B (Phase 24) replaces the BlockNote-backed editor with a TipTap-backed
// editor in stages. While the new editor is under construction the shim picks
// between the two at module-eval time via `NEXT_PUBLIC_EDITOR`:
//
//   NEXT_PUBLIC_EDITOR=tiptap    → TipTap (Plan B)
//   NEXT_PUBLIC_EDITOR=blocknote → BlockNote (legacy — default during dev)
//   <unset>                      → BlockNote (legacy — default)
//
// Once Plan B is smoke-tested in the browser and we reach B.8, the flag is
// removed and only the TipTap impl ships.

const useTipTap = process.env.NEXT_PUBLIC_EDITOR === 'tiptap';

const EditorSkeleton = () => (
  <div className="space-y-2 p-4">
    <Skeleton className="h-5 w-2/3" />
    <Skeleton className="h-4 w-full" />
    <Skeleton className="h-4 w-5/6" />
    <Skeleton className="h-4 w-3/4" />
  </div>
);

const TipTapImpl = dynamic(
  () => import('./TipTapEditorImpl').then(m => ({ default: m.TipTapEditor })),
  { ssr: false, loading: EditorSkeleton },
);

const BlockNoteImpl = dynamic(
  () => import('./BlockNoteEditorImpl').then(m => ({ default: m.BlockNoteEditor })),
  { ssr: false, loading: EditorSkeleton },
);

type EditorMode = 'note' | 'cornell-cue' | 'cornell-notes' | 'cornell-summary';

interface BlockEditorProps {
  content?: unknown;
  onChange?: (content: unknown) => void;
  onSelectionChange?: (range: { from: number; to: number }, text: string) => void;
  /** Hook for the selection bubble menu's "Stage" action (TipTap path only). */
  onStage?: (
    kind: 'cue' | 'note',
    payload: { text: string; from: number; to: number },
  ) => void;
  readOnly?: boolean;
  placeholder?: string;
  studySetId?: string;
  currentNoteId?: string;
  disableSubpage?: boolean;
  /** TipTap-only — drives placeholder defaults, slash-item filtering, and
   *  the in-column gutter padding for Cornell. */
  disableCloze?: boolean;
  mode?: EditorMode;
}

export function BlockEditor(props: BlockEditorProps) {
  if (useTipTap) {
    return <TipTapImpl {...props} />;
  }
  // BlockNote path doesn't support onStage / mode / disableCloze — strip
  // them silently before forwarding.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { onStage, mode, disableCloze, ...rest } = props;
  return <BlockNoteImpl {...rest} />;
}
