'use client';

import { useContext } from 'react';
import Link from 'next/link';
import { FileText } from 'lucide-react';
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { EditorSessionContext } from './TipTapEditorImpl';

export function SubpageNodeView({ node }: NodeViewProps): JSX.Element {
  const { studySetId } = useContext(EditorSessionContext);
  const childNoteId = String(node.attrs.childNoteId ?? '');
  const childTitle = String(node.attrs.childTitle ?? 'Untitled');

  if (!studySetId || !childNoteId) {
    return (
      <NodeViewWrapper
        as="div"
        className="subpage-card flex items-center gap-2 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] px-3 py-2 my-1 text-sm text-[hsl(var(--foreground-muted))]"
        data-drag-handle
      >
        <FileText className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="font-medium">{childTitle || 'Untitled'}</span>
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper as="div" className="subpage-card my-1" data-drag-handle>
      <Link
        href={`/sets/${studySetId}/notes/${childNoteId}`}
        className="flex items-center gap-2 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] px-3 py-2 text-sm text-foreground hover:bg-[hsl(var(--surface-3))] transition-colors"
        title="Open subpage"
        contentEditable={false}
      >
        <FileText
          className="h-4 w-4 shrink-0 text-[hsl(var(--foreground-subtle))]"
          aria-hidden="true"
        />
        <span className="font-medium hover:underline">{childTitle || 'Untitled'}</span>
      </Link>
    </NodeViewWrapper>
  );
}
