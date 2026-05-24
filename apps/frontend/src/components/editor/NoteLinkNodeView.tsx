'use client';

import { useContext } from 'react';
import Link from 'next/link';
import { FileText } from 'lucide-react';
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { EditorSessionContext } from './TipTapEditorImpl';

// Inline mention chip rendering a `[[Note Title]]` reference. Click navigates
// to the referenced note via Next.js routing.
export function NoteLinkNodeView({ node }: NodeViewProps): JSX.Element {
  const { studySetId } = useContext(EditorSessionContext);
  const childNoteId = String(node.attrs.childNoteId ?? '');
  const childTitle = String(node.attrs.childTitle ?? 'Untitled');

  const inner = (
    <span className="inline-flex items-center gap-0.5 align-baseline">
      <FileText
        className="h-3 w-3 shrink-0 text-[hsl(var(--foreground-subtle))]"
        aria-hidden="true"
      />
      <span>{childTitle || 'Untitled'}</span>
    </span>
  );

  if (!studySetId || !childNoteId) {
    // Orphan reference (missing setId or noteId) — render a non-interactive
    // chip with muted styling so the editor still parses cleanly.
    return (
      <NodeViewWrapper
        as="span"
        className="note-link mx-px inline-flex items-center rounded bg-[hsl(var(--surface-2))] px-1 align-baseline text-sm text-[hsl(var(--foreground-muted))]"
      >
        {inner}
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper as="span" className="note-link mx-px inline-block align-baseline">
      <Link
        href={`/sets/${studySetId}/notes/${childNoteId}`}
        className="inline-flex items-center rounded bg-[hsl(var(--primary-soft))] px-1 text-sm text-[hsl(var(--primary))] no-underline hover:bg-[hsl(var(--primary-soft))]/80 hover:underline transition-colors"
        title={`Open ${childTitle || 'Untitled'}`}
        contentEditable={false}
        // Keep the click from leaking up to the editor (which would set a
        // NodeSelection instead of navigating).
        onMouseDown={e => e.stopPropagation()}
      >
        {inner}
      </Link>
    </NodeViewWrapper>
  );
}
