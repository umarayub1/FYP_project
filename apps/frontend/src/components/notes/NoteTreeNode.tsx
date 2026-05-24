'use client';

import { memo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronRight, FileText, MoreHorizontal } from 'lucide-react';
import { type Note } from '@/lib/api/notes';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';

interface NoteTreeNodeProps {
  note:     Note;
  allNotes: Note[];
  depth:    number;
  setId:    string;
  expanded: Set<string>;
  onToggle: (noteId: string) => void;
  onRename: (note: Note) => void;
  onDelete: (noteId: string) => void;
  onMove:   (note: Note) => void;
  onExport: (note: Note) => void;
}

export const NoteTreeNode = memo(function NoteTreeNode({
  note,
  allNotes,
  depth,
  setId,
  expanded,
  onToggle,
  onRename,
  onDelete,
  onMove,
  onExport,
}: NoteTreeNodeProps) {
  const router = useRouter();
  const children = allNotes.filter(n => n.parentNoteId === note._id);
  const hasChildren = children.length > 0;
  const isExpanded = expanded.has(note._id);

  const rowContent = (
    <div
      className="flex items-center gap-1.5 px-2 py-2 min-h-[36px] rounded-md hover:bg-[hsl(var(--surface))] transition-colors group"
      style={{ paddingLeft: `${8 + depth * 16}px` }}
    >
      {/* Chevron or spacer */}
      <button
        type="button"
        className={cn(
          'shrink-0 w-4 h-4 flex items-center justify-center rounded text-foreground-subtle',
          'hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus-ring',
          !hasChildren && 'pointer-events-none opacity-0',
        )}
        onClick={e => { e.preventDefault(); e.stopPropagation(); onToggle(note._id); }}
        aria-label={isExpanded ? 'Collapse' : 'Expand'}
      >
        <ChevronRight
          className={cn('h-3.5 w-3.5 transition-transform', isExpanded && 'rotate-90')}
          aria-hidden="true"
        />
      </button>

      <FileText className="h-3.5 w-3.5 shrink-0 text-[hsl(var(--foreground-subtle))]" aria-hidden="true" />

      <span className="flex-1 min-w-0 truncate text-sm text-foreground">
        {note.title || 'Untitled'}
      </span>

      <div
        className="opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity shrink-0"
        onClick={e => e.preventDefault()}
      >
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              aria-label={`More options for ${note.title || 'Untitled'}`}
            >
              <MoreHorizontal size={12} aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => router.push(`/sets/${setId}/notes/${note._id}`)}>
              Open
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onRename(note)}>
              Rename
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onMove(note)}>
              Move to set…
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onExport(note)}>
              Export to markdown
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => onDelete(note._id)}
              className="text-[hsl(var(--danger))] focus:text-[hsl(var(--danger))]"
            >
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );

  return (
    <>
      <li role="listitem">
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <Link
              href={`/sets/${setId}/notes/${note._id}`}
              className="block rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            >
              {rowContent}
            </Link>
          </ContextMenuTrigger>
          <ContextMenuContent className="w-48">
            <ContextMenuItem onSelect={() => router.push(`/sets/${setId}/notes/${note._id}`)}>
              Open
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => onRename(note)}>
              Rename
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => onMove(note)}>
              Move to set…
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => onExport(note)}>
              Export to markdown
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem
              onSelect={() => onDelete(note._id)}
              className="text-[hsl(var(--danger))] focus:text-[hsl(var(--danger))]"
            >
              Delete
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      </li>

      {/* Recursive children */}
      {hasChildren && isExpanded && (
        <ul role="list" aria-label={`Children of ${note.title || 'Untitled'}`}>
          {children.map(child => (
            <NoteTreeNode
              key={child._id}
              note={child}
              allNotes={allNotes}
              depth={depth + 1}
              setId={setId}
              expanded={expanded}
              onToggle={onToggle}
              onRename={onRename}
              onDelete={onDelete}
              onMove={onMove}
              onExport={onExport}
            />
          ))}
        </ul>
      )}
    </>
  );
});
