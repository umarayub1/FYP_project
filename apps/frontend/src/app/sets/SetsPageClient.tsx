'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, LayoutGrid, ChevronDown, ChevronRight, BookOpen } from 'lucide-react';
import { toast } from 'sonner';
import {
  type StudySet,
  createStudySet,
  updateStudySet,
  deleteStudySet,
  archiveStudySet,
} from '@/lib/api/study-sets';
import { StudySetCard } from '@/components/sets/StudySetCard';
import { CreateStudySetModal } from '@/components/studyset/CreateStudySetModal';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { EmptyState } from '@/components/patterns/EmptyState';

const COLOR_SWATCHES: { token: string; label: string }[] = [
  { token: '--set-violet', label: 'Violet' },
  { token: '--set-teal',   label: 'Teal'   },
  { token: '--set-amber',  label: 'Amber'  },
  { token: '--set-red',    label: 'Red'    },
  { token: '--set-blue',   label: 'Blue'   },
  { token: '--set-green',  label: 'Green'  },
  { token: '--set-pink',   label: 'Pink'   },
  { token: '--set-slate',  label: 'Slate'  },
];

interface EditDialogProps {
  set: StudySet | null;
  onClose: () => void;
  onSave: (setId: string, name: string, color: string) => Promise<void>;
}

function EditDialog({ set, onClose, onSave }: EditDialogProps) {
  const [name, setName]     = useState(set?.name ?? '');
  const [color, setColor]   = useState(set?.color ?? `hsl(var(--set-violet))`);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) { setError('Name is required.'); return; }
    setLoading(true);
    setError('');
    try {
      await onSave(set!._id, trimmed, color);
      onClose();
    } catch {
      setError('Could not update study set. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={set !== null} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Edit study set</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="edit-set-name" className="text-xs font-medium text-foreground-muted">Name</label>
            <input
              ref={inputRef}
              id="edit-set-name"
              type="text"
              value={name}
              onChange={e => { setName(e.target.value); setError(''); }}
              maxLength={100}
              className={cn(
                'h-9 w-full rounded-md border bg-surface-2 px-3 text-sm text-foreground placeholder:text-foreground-subtle',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
                error ? 'border-danger' : 'border-border'
              )}
            />
            {error && <p className="text-xs text-danger">{error}</p>}
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium text-foreground-muted">Color</span>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Set color">
              {COLOR_SWATCHES.map(({ token, label }) => {
                const tokenVal = `hsl(var(${token}))`;
                return (
                  <button
                    key={token}
                    type="button"
                    role="radio"
                    aria-checked={color === tokenVal}
                    aria-label={label}
                    onClick={() => setColor(tokenVal)}
                    className={cn(
                      'relative h-7 w-7 rounded-full transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring cursor-pointer',
                      color === tokenVal ? 'scale-110 ring-2 ring-offset-2 ring-offset-background' : 'hover:scale-105'
                    )}
                    style={{ backgroundColor: tokenVal }}
                  />
                );
              })}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
            <Button type="submit" disabled={loading || !name.trim()}>Save</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface SetsPageClientProps {
  initialSets: StudySet[];
}

export function SetsPageClient({ initialSets }: SetsPageClientProps) {
  const router = useRouter();
  const [sets, setSets]               = useState(() => initialSets.filter(s => !s.archived));
  const [archivedSets, setArchivedSets] = useState(() => initialSets.filter(s => !!s.archived));
  const [showArchived, setShowArchived] = useState(false);
  const [createOpen, setCreateOpen]   = useState(false);
  const [editSet, setEditSet]         = useState<StudySet | null>(null);
  const [deleteId, setDeleteId]       = useState<string | null>(null);
  const [deleting, setDeleting]       = useState(false);

  async function handleEdit(setId: string, name: string, color: string) {
    const updated = await updateStudySet(setId, { name, color });
    setSets(prev => prev.map(s => s._id === setId ? updated : s));
  }

  async function handleDuplicate(set: StudySet) {
    const copy = await createStudySet({ name: `${set.name} (copy)`, color: set.color });
    setSets(prev => [...prev, copy]);
  }

  async function handleDelete() {
    if (!deleteId) return;
    setDeleting(true);
    setSets(prev => prev.filter(s => s._id !== deleteId));
    setArchivedSets(prev => prev.filter(s => s._id !== deleteId));
    try {
      await deleteStudySet(deleteId);
      router.refresh();
    } catch {
      router.refresh();
    } finally {
      setDeleting(false);
      setDeleteId(null);
    }
  }

  async function handleArchive(setId: string) {
    const set = sets.find(s => s._id === setId);
    if (!set) return;

    // Optimistic: move to archived
    setSets(prev => prev.filter(s => s._id !== setId));
    setArchivedSets(prev => [{ ...set, archived: true }, ...prev]);

    try {
      await archiveStudySet(setId, true);
      toast(`"${set.name}" archived.`, {
        action: {
          label: 'Undo',
          onClick: () => handleUnarchive(setId),
        },
        duration: 5000,
      });
      router.refresh();
    } catch {
      // Rollback
      setSets(prev => [set, ...prev]);
      setArchivedSets(prev => prev.filter(s => s._id !== setId));
    }
  }

  async function handleUnarchive(setId: string) {
    const set = archivedSets.find(s => s._id === setId);
    if (!set) return;

    // Optimistic: move back to active
    setArchivedSets(prev => prev.filter(s => s._id !== setId));
    setSets(prev => [{ ...set, archived: false }, ...prev]);

    try {
      await archiveStudySet(setId, false);
      router.refresh();
    } catch {
      // Rollback
      setSets(prev => prev.filter(s => s._id !== setId));
      setArchivedSets(prev => [set, ...prev]);
    }
  }

  const deletingSet = sets.find(s => s._id === deleteId)
    ?? archivedSets.find(s => s._id === deleteId)
    ?? initialSets.find(s => s._id === deleteId);

  return (
    <>
      <CreateStudySetModal
        open={createOpen}
        onClose={() => { setCreateOpen(false); router.refresh(); }}
      />

      <EditDialog
        set={editSet}
        onClose={() => setEditSet(null)}
        onSave={handleEdit}
      />

      <AlertDialog open={deleteId !== null} onOpenChange={v => { if (!v) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &ldquo;{deletingSet?.name}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the study set and all its documents, flashcards, and notes.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-danger text-white hover:bg-danger/90"
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="px-content-x py-8 max-w-5xl mx-auto">
        <div className="flex items-center justify-between gap-4 mb-section-y">
          <div className="flex items-center gap-2">
            <LayoutGrid className="h-5 w-5 text-foreground-muted" aria-hidden="true" />
            <h1 className="text-h1 text-foreground">Study Sets</h1>
          </div>
          <Button className="gap-2" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            New set
          </Button>
        </div>

        {sets.length === 0 && archivedSets.length === 0 ? (
          <EmptyState
            icon={<BookOpen className="h-6 w-6" aria-hidden="true" />}
            headline="Start with one subject."
            subline="Add more anytime."
            action={
              <Button className="gap-2" onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                Create Study Set
              </Button>
            }
          />
        ) : (
          <>
            {sets.length > 0 && (
              <div
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
                role="list"
                aria-label="Study sets"
              >
                {sets.map(set => (
                  <div key={set._id} role="listitem">
                    <StudySetCard
                      set={set}
                      onEdit={s => setEditSet(s)}
                      onDuplicate={handleDuplicate}
                      onDelete={id => setDeleteId(id)}
                      onArchive={handleArchive}
                    />
                  </div>
                ))}
              </div>
            )}

            {archivedSets.length > 0 && (
              <div className="mt-8">
                <button
                  onClick={() => setShowArchived(v => !v)}
                  className="flex items-center gap-1.5 text-sm text-foreground-muted hover:text-foreground transition-colors duration-75 mb-3"
                  aria-expanded={showArchived}
                >
                  {showArchived
                    ? <ChevronDown className="h-4 w-4" aria-hidden="true" />
                    : <ChevronRight className="h-4 w-4" aria-hidden="true" />
                  }
                  Show archived ({archivedSets.length})
                </button>

                {showArchived && (
                  <div
                    className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 opacity-60"
                    role="list"
                    aria-label="Archived study sets"
                  >
                    {archivedSets.map(set => (
                      <div key={set._id} role="listitem">
                        <StudySetCard
                          set={set}
                          onEdit={s => setEditSet(s)}
                          onDuplicate={handleDuplicate}
                          onDelete={id => setDeleteId(id)}
                          onArchive={handleUnarchive}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
