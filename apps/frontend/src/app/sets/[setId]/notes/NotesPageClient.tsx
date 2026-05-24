'use client';

import { useState, useRef, useMemo, useCallback, useEffect, memo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { FileText, Plus, MoreHorizontal, Notebook } from 'lucide-react';
import { type Note, deleteNote, updateNote, moveNote, bulkDeleteNotes, bulkMoveNotes } from '@/lib/api/notes';
import { type StudySet, getStudySets } from '@/lib/api/study-sets';
import { blocksToMarkdown, downloadMarkdown } from '@/lib/notes/markdown';
import { EmptyState } from '@/components/patterns/EmptyState';
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
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { NoteTreeNode } from '@/components/notes/NoteTreeNode';
import { formatRelative } from '@/lib/format/date';
import { useBulkSelection } from '@/hooks/useBulkSelection';
import { Marquee } from '@/components/patterns/Marquee';
import { BulkActionBar } from '@/components/patterns/BulkActionBar';

// Extract plain text word count from BlockNote JSON content
function countWords(content: unknown): number {
  if (!content || !Array.isArray(content)) return 0;
  let wordCount = 0;
  function walk(node: unknown): void {
    if (!node || typeof node !== 'object') return;
    const obj = node as Record<string, unknown>;
    if (typeof obj.text === 'string' && obj.text.trim()) {
      wordCount += obj.text.trim().split(/\s+/).filter(Boolean).length;
    }
    if (Array.isArray(obj.content)) obj.content.forEach(walk);
    if (Array.isArray(obj.children)) obj.children.forEach(walk);
  }
  (content as unknown[]).forEach(walk);
  return wordCount;
}

interface RenameDialogProps {
  note: Note | null;
  onClose: () => void;
  onSave: (noteId: string, title: string) => Promise<void>;
}

function RenameDialog({ note, onClose, onSave }: RenameDialogProps) {
  const [title, setTitle] = useState(note?.title ?? '');
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await onSave(note!._id, title.trim() || 'Untitled');
      onClose();
    } catch {
      // noop
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={note !== null} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Rename note</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
          <input
            ref={inputRef}
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Note title"
            maxLength={200}
            autoFocus
            className="h-9 w-full rounded-md border border-border bg-surface-2 px-3 text-sm text-foreground placeholder:text-foreground-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
            <Button type="submit" disabled={loading}>Save</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface NoteRowProps {
  note:     Note;
  setId:    string;
  onRename: (note: Note) => void;
  onDelete: (noteId: string) => void;
  onMove:   (note: Note) => void;
  onExport: (note: Note) => void;
  selected:  boolean;
  onToggle:  (id: string, e: React.MouseEvent) => void;
}

const NoteRow = memo(function NoteRow({ note, setId, onRename, onDelete, onMove, onExport, selected, onToggle }: NoteRowProps) {
  const router = useRouter();
  const wordCount = useMemo(() => countWords(note.content), [note.content]);
  const relativeDate = formatRelative(note.updatedAt);

  const inner = (
    <div
      data-selectable-id={note._id}
      className={`flex items-start gap-3 px-4 py-3 min-h-[48px] rounded-md hover:bg-[hsl(var(--surface))] transition-colors group${selected ? ' bg-[hsl(var(--primary)/0.06)]' : ''}`}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={() => {}}
        onClick={e => { e.preventDefault(); e.stopPropagation(); onToggle(note._id, e as unknown as React.MouseEvent); }}
        className={`accent-primary shrink-0 mt-0.5 cursor-pointer transition-opacity${selected ? ' opacity-100' : ' opacity-0 group-hover:opacity-100'}`}
        aria-label={`Select ${note.title || 'Untitled'}`}
      />
      <FileText className="h-4 w-4 shrink-0 text-[hsl(var(--foreground-subtle))] mt-0.5" aria-hidden="true" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground truncate">
            {note.title || 'Untitled'}
          </span>
          {note.isCornell && (
            <span className="shrink-0 rounded-full bg-[hsl(var(--primary-soft))] px-2 py-0.5 font-mono text-[10px] text-[hsl(var(--primary))]">
              Cornell
            </span>
          )}
        </div>
        <p className="mt-0.5 font-mono text-[12px] text-[hsl(var(--foreground-muted))]">
          Last edited {relativeDate} · {wordCount.toLocaleString()} words
        </p>
      </div>
      <div
        className="opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity shrink-0 mt-0.5"
        onClick={e => e.stopPropagation()}
      >
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              aria-label={`More options for ${note.title || 'Untitled'}`}
            >
              <MoreHorizontal size={14} aria-hidden="true" />
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
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <Link
          href={`/sets/${setId}/notes/${note._id}`}
          className="block rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        >
          {inner}
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
  );
});

interface MoveNoteDialogProps {
  note:         Note | null;
  currentSetId: string;
  studySets:    StudySet[];
  onClose:      () => void;
  onSave:       (noteId: string, toSetId: string) => Promise<void>;
}

function MoveNoteDialog({ note, currentSetId, studySets, onClose, onSave }: MoveNoteDialogProps) {
  const [target, setTarget] = useState('');
  const [busy,   setBusy]   = useState(false);

  useEffect(() => { setTarget(''); }, [note?._id]);

  const eligible = studySets.filter(s => s._id !== currentSetId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!note || !target) return;
    setBusy(true);
    try {
      await onSave(note._id, target);
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={note !== null} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Move note to set</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
          {eligible.length === 0 ? (
            <p className="text-sm text-[hsl(var(--foreground-muted))]">No other study sets available.</p>
          ) : (
            <select
              value={target}
              onChange={e => setTarget(e.target.value)}
              autoFocus
              className="h-9 w-full rounded-md border border-border bg-surface-2 px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            >
              <option value="" disabled>Choose a study set…</option>
              {eligible.map(s => (
                <option key={s._id} value={s._id}>{s.name}</option>
              ))}
            </select>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button type="submit" disabled={busy || !target}>Move</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface NotesPageClientProps {
  setId:        string;
  set:          StudySet | undefined;
  initialNotes: Note[];
}

export function NotesPageClient({ setId, set: _set, initialNotes }: NotesPageClientProps) {
  const router = useRouter();
  const [notes, setNotes]           = useState(initialNotes);
  const [renameNote, setRenameNote] = useState<Note | null>(null);
  const [moveNoteTarget, setMoveNoteTarget] = useState<Note | null>(null);
  const [studySets, setStudySets]   = useState<StudySet[]>([]);
  const [sortOrder, setSortOrder]   = useState<'last-edited' | 'title'>('last-edited');
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkMoveOpen,   setBulkMoveOpen]   = useState(false);
  const [bulkMoveTarget, setBulkMoveTarget] = useState('');
  const [bulkBusy,       setBulkBusy]       = useState(false);
  const listRef = useRef<HTMLUListElement>(null);
  const getId = useCallback((n: Note) => n._id, []);
  const bulk = useBulkSelection({ items: notes, getId });

  // Load the list of study sets once for the Move dialog.
  useEffect(() => {
    getStudySets({ includeArchived: true })
      .then(sets => setStudySets(sets))
      .catch(() => { /* sidebar shows nothing — non-fatal */ });
  }, []);

  // Tree expansion state, persisted to localStorage per setId
  const expandedStorageKey = `synapse:notes-tree-expanded:${setId}`;
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set<string>());

  useEffect(() => {
    try {
      const stored = localStorage.getItem(expandedStorageKey);
      if (stored) setExpanded(new Set(JSON.parse(stored) as string[]));
    } catch {
      // localStorage unavailable
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandedStorageKey]);

  const toggleExpanded = useCallback((noteId: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(noteId)) next.delete(noteId);
      else next.add(noteId);
      try { localStorage.setItem(expandedStorageKey, JSON.stringify([...next])); } catch { /* noop */ }
      return next;
    });
  }, [expandedStorageKey]);

  // Root notes: no parentNoteId or parentNoteId === null
  const rootNotes = useMemo(() => {
    const roots = notes.filter(n => !n.parentNoteId);
    return [...roots].sort((a, b) => {
      if (sortOrder === 'title') return (a.title || '').localeCompare(b.title || '');
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  }, [notes, sortOrder]);

  // Whether the dataset has ANY parent-child relationships
  const hasTree = useMemo(() => notes.some(n => !!n.parentNoteId), [notes]);

  const handleRename = useCallback(async (noteId: string, title: string) => {
    const updated = await updateNote(noteId, setId, { title });
    setNotes(prev => prev.map(n => n._id === noteId ? { ...n, title: updated.title } : n));
  }, [setId]);

  const handleDelete = useCallback(async (noteId: string) => {
    setNotes(prev => prev.filter(n => n._id !== noteId));
    await deleteNote(noteId, setId).catch(() => {
      router.refresh();
    });
  }, [setId, router]);

  const handleMove = useCallback(async (noteId: string, toSetId: string) => {
    try {
      await moveNote(noteId, setId, toSetId);
      // Moved note is no longer in this set's view.
      setNotes(prev => prev.filter(n => n._id !== noteId));
      toast.success('Moved to set');
      router.refresh();
    } catch (err) {
      toast.error('Move failed', { description: (err as Error).message });
    }
  }, [setId, router]);

  const handleExport = useCallback((note: Note) => {
    const md = blocksToMarkdown(note.content);
    const heading = note.title ? `# ${note.title}\n\n` : '';
    const safeName = (note.title || 'Untitled').replace(/[^a-z0-9-_ ]/gi, '').trim() || 'note';
    downloadMarkdown(`${safeName}.md`, heading + md);
  }, []);

  const handleToggle = useCallback((id: string, e: React.MouseEvent) => {
    bulk.toggle(id, { shift: e.shiftKey, cmd: e.metaKey || e.ctrlKey });
  }, [bulk]);

  // Collect child IDs of all selected parent notes
  const childIdsOfSelected = useMemo(() => {
    const children: string[] = [];
    notes.forEach(n => {
      if (n.parentNoteId && bulk.selected.has(n.parentNoteId)) children.push(n._id);
    });
    return children;
  }, [notes, bulk.selected]);

  const handleBulkDelete = useCallback(async (includeChildren: boolean) => {
    setBulkBusy(true);
    try {
      const ids = Array.from(bulk.selected);
      const allIds = includeChildren ? [...ids, ...childIdsOfSelected] : ids;
      await bulkDeleteNotes(allIds, setId);
      const allIdsSet = new Set(allIds);
      setNotes(prev => prev.filter(n => !allIdsSet.has(n._id)));
      bulk.clear();
      setBulkDeleteOpen(false);
      toast.success(`Deleted ${allIds.length} note${allIds.length !== 1 ? 's' : ''}`);
    } catch {
      toast.error('Bulk delete failed');
    } finally {
      setBulkBusy(false);
    }
  }, [bulk, childIdsOfSelected, setId]);

  const handleBulkMove = useCallback(async () => {
    if (!bulkMoveTarget) return;
    setBulkBusy(true);
    try {
      const ids = Array.from(bulk.selected);
      await bulkMoveNotes(ids, setId, bulkMoveTarget);
      setNotes(prev => prev.filter(n => !bulk.selected.has(n._id)));
      bulk.clear();
      setBulkMoveOpen(false);
      setBulkMoveTarget('');
      toast.success(`Moved ${ids.length} note${ids.length !== 1 ? 's' : ''}`);
      router.refresh();
    } catch {
      toast.error('Bulk move failed');
    } finally {
      setBulkBusy(false);
    }
  }, [bulk, bulkMoveTarget, setId, router]);

  const eligibleSets = studySets.filter(s => s._id !== setId);

  return (
    <>
      <RenameDialog
        note={renameNote}
        onClose={() => setRenameNote(null)}
        onSave={handleRename}
      />

      <MoveNoteDialog
        note={moveNoteTarget}
        currentSetId={setId}
        studySets={studySets}
        onClose={() => setMoveNoteTarget(null)}
        onSave={handleMove}
      />

      {/* Bulk delete confirmation */}
      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {bulk.count} note{bulk.count !== 1 ? 's' : ''}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete {bulk.count} note{bulk.count !== 1 ? 's' : ''}.
              {childIdsOfSelected.length > 0 && ` ${childIdsOfSelected.length} child note${childIdsOfSelected.length !== 1 ? 's' : ''} will be orphaned (you can delete them separately).`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkBusy}>Cancel</AlertDialogCancel>
            {childIdsOfSelected.length > 0 && (
              <AlertDialogAction
                onClick={() => handleBulkDelete(true)}
                disabled={bulkBusy}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete with children
              </AlertDialogAction>
            )}
            <AlertDialogAction
              onClick={() => handleBulkDelete(false)}
              disabled={bulkBusy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete selected
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk move dialog */}
      <Dialog open={bulkMoveOpen} onOpenChange={v => { if (!v) { setBulkMoveOpen(false); setBulkMoveTarget(''); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Move {bulk.count} note{bulk.count !== 1 ? 's' : ''} to set</DialogTitle>
          </DialogHeader>
          <div className="mt-4 flex flex-col gap-4">
            {eligibleSets.length === 0 ? (
              <p className="text-sm text-foreground-muted">No other study sets available.</p>
            ) : (
              <select
                value={bulkMoveTarget}
                onChange={e => setBulkMoveTarget(e.target.value)}
                autoFocus
                aria-label="Target study set"
                className="h-9 w-full rounded-md border border-border bg-surface-2 px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
              >
                <option value="" disabled>Choose a study set…</option>
                {eligibleSets.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
              </select>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setBulkMoveOpen(false); setBulkMoveTarget(''); }} disabled={bulkBusy}>Cancel</Button>
              <Button onClick={handleBulkMove} disabled={bulkBusy || !bulkMoveTarget}>Move</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <div className="px-content-x py-8 max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <h1 className="text-h1 text-foreground">Notes</h1>
            <span className="font-mono text-xs text-[hsl(var(--foreground-muted))]">
              {notes.length} {notes.length === 1 ? 'note' : 'notes'}
            </span>
          </div>
          <Button asChild variant="outline" size="sm" className="gap-2">
            <Link href={`/sets/${setId}/notes/new`}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              New note
            </Link>
          </Button>
        </div>

        {/* Sort control */}
        {notes.length > 0 && (
          <div className="flex items-center gap-2 mb-4 border-b border-border pb-3">
            <select
              value={sortOrder}
              onChange={e => setSortOrder(e.target.value as 'last-edited' | 'title')}
              className="text-xs font-mono text-[hsl(var(--foreground-muted))] bg-transparent border-none outline-none cursor-pointer hover:text-foreground transition-colors"
              aria-label="Sort notes by"
            >
              <option value="last-edited">Last edited ▾</option>
              <option value="title">Title ▾</option>
            </select>
          </div>
        )}

        {notes.length === 0 ? (
          <EmptyState
            icon={<Notebook className="h-6 w-6" aria-hidden="true" />}
            headline="No notes in this set yet."
            subline="Write a note or use Cornell layout to get started."
            action={
              <Button asChild className="gap-2">
                <Link href={`/sets/${setId}/notes/new`}>
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Create your first note
                </Link>
              </Button>
            }
          />
        ) : (
          <>
            <div className="flex items-center gap-3 px-4 py-2">
              <input
                type="checkbox"
                checked={bulk.count === notes.length && notes.length > 0}
                onChange={() => { if (bulk.count === notes.length) bulk.clear(); else bulk.selectAll(); }}
                className="accent-primary cursor-pointer"
                aria-label="Select all notes"
              />
              <span className="text-xs text-foreground-subtle">
                {notes.length} note{notes.length !== 1 ? 's' : ''}
                {bulk.count > 0 && ` · ${bulk.count} selected`}
              </span>
            </div>
            {hasTree ? (
          /* Tree view — when notes have parent/child relationships */
          <ul ref={listRef} className="flex flex-col gap-0.5 relative" role="list" aria-label="Notes">
            {rootNotes.map(note => (
              <NoteTreeNode
                key={note._id}
                note={note}
                allNotes={notes}
                depth={0}
                setId={setId}
                expanded={expanded}
                onToggle={toggleExpanded}
                onRename={setRenameNote}
                onDelete={handleDelete}
                onMove={setMoveNoteTarget}
                onExport={handleExport}
              />
            ))}
            <Marquee containerRef={listRef} onSelect={(ids, mode) => bulk.selectIds(ids, mode)} />
          </ul>
        ) : (
          /* Flat list — no hierarchy yet */
          <ul ref={listRef} className="flex flex-col gap-0.5 relative" role="list" aria-label="Notes">
            {rootNotes.map(note => (
              <li key={note._id} role="listitem">
                <NoteRow
                  note={note}
                  setId={setId}
                  onRename={setRenameNote}
                  onDelete={handleDelete}
                  onMove={setMoveNoteTarget}
                  onExport={handleExport}
                  selected={bulk.isSelected(note._id)}
                  onToggle={handleToggle}
                />
              </li>
            ))}
            <Marquee containerRef={listRef} onSelect={(ids, mode) => bulk.selectIds(ids, mode)} />
          </ul>
        )}
          </>
        )}
      </div>

      <BulkActionBar
        count={bulk.count}
        onDelete={() => setBulkDeleteOpen(true)}
        onMove={studySets.length > 1 ? () => setBulkMoveOpen(true) : undefined}
        onCancel={bulk.clear}
      />
    </>
  );
}
