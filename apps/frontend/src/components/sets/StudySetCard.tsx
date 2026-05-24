'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { MoreHorizontal, BookOpen, Clock } from 'lucide-react';
import { type StudySet } from '@/lib/api/study-sets';
import { Button } from '@/components/ui/button';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/cn';

interface StudySetCardProps {
  set: StudySet;
  onEdit: (set: StudySet) => void;
  onDuplicate: (set: StudySet) => void;
  onDelete: (setId: string) => void;
  onArchive?: (setId: string) => void;
}

export function StudySetCard({ set, onEdit, onDuplicate, onDelete, onArchive }: StudySetCardProps) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  const actions = {
    open:      () => router.push(`/sets/${set._id}`),
    edit:      () => onEdit(set),
    duplicate: () => onDuplicate(set),
    delete:    () => onDelete(set._id),
    archive:   () => onArchive?.(set._id),
  };

  const menuItems = (
    <>
      <ContextMenuItem onSelect={actions.open}>Open</ContextMenuItem>
      <ContextMenuItem onSelect={actions.edit}>Edit</ContextMenuItem>
      <ContextMenuItem onSelect={actions.duplicate}>Duplicate</ContextMenuItem>
      {onArchive && (
        <ContextMenuItem onSelect={actions.archive}>
          {set.archived ? 'Unarchive' : 'Archive'}
        </ContextMenuItem>
      )}
      <ContextMenuSeparator />
      <ContextMenuItem
        onSelect={actions.delete}
        className="text-[hsl(var(--danger))] focus:text-[hsl(var(--danger))]"
      >
        Delete
      </ContextMenuItem>
    </>
  );

  const updatedAt = new Date(set.updatedAt).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          className="group relative flex flex-col overflow-hidden rounded-xl border border-border bg-background hover:shadow-md transition-shadow duration-150 cursor-pointer"
          onClick={actions.open}
          onKeyDown={e => e.key === 'Enter' && actions.open()}
          role="button"
          tabIndex={0}
          aria-label={`Open ${set.name}`}
        >
          {/* Color bar */}
          <div
            className="h-1.5 w-full shrink-0"
            style={{ backgroundColor: set.color }}
            aria-hidden="true"
          />

          <div className="flex flex-col gap-2 p-4 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="h-2.5 w-2.5 rounded-full shrink-0 mt-0.5"
                  style={{ backgroundColor: set.color }}
                  aria-hidden="true"
                />
                <h3 className="text-sm font-medium text-foreground truncate">{set.name}</h3>
              </div>

              {/* Overflow "..." button */}
              <div
                className="opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-[80ms] shrink-0"
                onClick={e => e.stopPropagation()}
              >
                <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      aria-label={`More options for ${set.name}`}
                    >
                      <MoreHorizontal size={14} aria-hidden="true" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-48" align="end">
                    <DropdownMenuItem onSelect={actions.open}>Open</DropdownMenuItem>
                    <DropdownMenuItem onSelect={actions.edit}>Edit</DropdownMenuItem>
                    <DropdownMenuItem onSelect={actions.duplicate}>Duplicate</DropdownMenuItem>
                    {onArchive && (
                      <DropdownMenuItem onSelect={actions.archive}>
                        {set.archived ? 'Unarchive' : 'Archive'}
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onSelect={actions.delete}
                      className="text-[hsl(var(--danger))] focus:text-[hsl(var(--danger))]"
                    >
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {/* Metadata row */}
            <div className="flex items-center gap-3 text-xs text-foreground-subtle mt-auto pt-1">
              <span className="flex items-center gap-1">
                <BookOpen className="h-3 w-3" aria-hidden="true" />
                {set.deadlines?.length ?? 0} deadline{(set.deadlines?.length ?? 0) !== 1 ? 's' : ''}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" aria-hidden="true" />
                {updatedAt}
              </span>
            </div>
          </div>
        </div>
      </ContextMenuTrigger>

      <ContextMenuContent className="w-48">
        {menuItems}
      </ContextMenuContent>
    </ContextMenu>
  );
}
