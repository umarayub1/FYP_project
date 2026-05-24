'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  patchDocument,
  reingestDocument,
  deleteDocument,
  type SynapseDocument,
} from '@/lib/api/documents';
import type { StudySet } from '@/lib/api/study-sets';

interface DocumentRowMenuProps {
  doc:           SynapseDocument;
  currentSetId:  string;
  studySets:     StudySet[];
  onMutated:     (next: SynapseDocument | null) => void;
}

export function DocumentRowMenu({ doc, currentSetId, studySets, onMutated }: DocumentRowMenuProps) {
  const router = useRouter();
  const [renameOpen, setRenameOpen] = useState(false);
  const [moveOpen,   setMoveOpen]   = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [busy,       setBusy]       = useState(false);

  const downloadHref = `/api/documents/${doc._id}/file`;

  async function handleReingest() {
    setBusy(true);
    try {
      await reingestDocument(doc._id);
      onMutated({ ...doc, ingestionStatus: 'pending' });
      toast.success('Re-ingestion queued', { description: doc.title });
    } catch (err) {
      toast.error('Failed to queue re-ingestion', { description: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    setBusy(true);
    try {
      await deleteDocument(doc._id);
      onMutated(null);
      toast.success('Document deleted', { description: doc.title });
      router.refresh();
    } catch (err) {
      toast.error('Delete failed', { description: (err as Error).message });
    } finally {
      setBusy(false);
      setDeleteOpen(false);
    }
  }

  return (
    <div onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
            aria-label={`Options for ${doc.title}`}
          >
            <MoreHorizontal className="h-4 w-4 text-[hsl(var(--foreground-muted))]" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={e => e.stopPropagation()}>
          <DropdownMenuItem onSelect={() => setRenameOpen(true)}>Rename</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setMoveOpen(true)}>Move to set…</DropdownMenuItem>
          <DropdownMenuItem
            asChild
            onSelect={() => {/* let anchor handle nav */}}
          >
            <a href={downloadHref} download={doc.title}>Download</a>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={handleReingest} disabled={busy}>
            Re-ingest
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => setDeleteOpen(true)}
            className="text-[hsl(var(--danger))] focus:text-[hsl(var(--danger))]"
          >
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <RenameDialog
        open={renameOpen}
        initialTitle={doc.title}
        onClose={() => setRenameOpen(false)}
        onSave={async title => {
          const updated = await patchDocument(doc._id, { title });
          onMutated(updated);
          toast.success('Renamed');
        }}
      />

      <MoveDialog
        open={moveOpen}
        currentSetId={currentSetId}
        studySets={studySets}
        onClose={() => setMoveOpen(false)}
        onSave={async targetSetId => {
          await patchDocument(doc._id, { studySetId: targetSetId });
          // After move, the doc no longer belongs to currentSetId.
          onMutated(null);
          toast.success('Moved to set');
          router.refresh();
        }}
      />

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent onClick={e => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &ldquo;{doc.title}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              The PDF, its vector chunks, and any annotations will be removed permanently.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={busy}
              className="bg-[hsl(var(--danger))] text-white hover:bg-[hsl(var(--danger))]/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function RenameDialog({
  open,
  initialTitle,
  onClose,
  onSave,
}: {
  open:         boolean;
  initialTitle: string;
  onClose:      () => void;
  onSave:       (title: string) => Promise<void>;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [busy,  setBusy]  = useState(false);
  const ref               = useRef<HTMLInputElement>(null);

  useEffect(() => { if (open) setTitle(initialTitle); }, [open, initialTitle]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const next = title.trim();
    if (!next || next === initialTitle) { onClose(); return; }
    setBusy(true);
    try {
      await onSave(next);
      onClose();
    } catch (err) {
      toast.error('Rename failed', { description: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm" onClick={e => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>Rename document</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
          <input
            ref={ref}
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Document title"
            maxLength={300}
            autoFocus
            className="h-9 w-full rounded-md border border-border bg-surface-2 px-3 text-sm text-foreground placeholder:text-foreground-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button type="submit" disabled={busy}>Save</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function MoveDialog({
  open,
  currentSetId,
  studySets,
  onClose,
  onSave,
}: {
  open:         boolean;
  currentSetId: string;
  studySets:    StudySet[];
  onClose:      () => void;
  onSave:       (targetSetId: string) => Promise<void>;
}) {
  const [target, setTarget] = useState('');
  const [busy,   setBusy]   = useState(false);

  useEffect(() => { if (open) setTarget(''); }, [open]);

  const eligible = studySets.filter(s => s._id !== currentSetId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!target) return;
    setBusy(true);
    try {
      await onSave(target);
      onClose();
    } catch (err) {
      toast.error('Move failed', { description: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm" onClick={e => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>Move to set</DialogTitle>
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
