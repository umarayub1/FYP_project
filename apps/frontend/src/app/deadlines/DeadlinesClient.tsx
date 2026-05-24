'use client';

import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
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
import { cn } from '@/lib/cn';
import { DeadlineList } from '@/components/deadlines/DeadlineList';
import { DeadlineDialog } from '@/components/deadlines/DeadlineDialog';
import {
  type Deadline,
  type DeadlineFilter,
  type CreateDeadlineInput,
  type UpdateDeadlineInput,
  createDeadline,
  updateDeadline,
  snoozeDeadline,
  markDeadlinePassed,
  unmarkDeadlinePassed,
  deleteDeadline,
  listDeadlines,
} from '@/lib/api/deadlines';
import type { StudySet } from '@/lib/api/study-sets';

interface DeadlinesClientProps {
  initialDeadlines: Deadline[];
  studySets: StudySet[];
}

const FILTERS: { id: DeadlineFilter; label: string }[] = [
  { id: 'all',      label: 'All' },
  { id: 'today',    label: 'Today' },
  { id: 'week',     label: 'This week' },
  { id: 'critical', label: 'Critical' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'passed',   label: 'Done' },
];

function daysUntil(iso: string): number {
  const target = new Date(iso);
  target.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

function matchesFilter(d: Deadline, filter: DeadlineFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'passed') return Boolean(d.passedAt);
  if (d.passedAt) return false;
  const diff = daysUntil(d.date);
  switch (filter) {
    case 'today':    return diff === 0;
    case 'week':     return diff >= 0 && diff <= 7;
    case 'critical': return diff >= 0 && diff <= 3;
    case 'upcoming': return diff > 0;
    default:         return true;
  }
}

export function DeadlinesClient({ initialDeadlines, studySets }: DeadlinesClientProps) {
  const [deadlines, setDeadlines] = useState<Deadline[]>(initialDeadlines);
  const [filter, setFilter] = useState<DeadlineFilter>('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Deadline | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Deadline | null>(null);

  const studySetsById = useMemo(() => {
    const m = new Map<string, StudySet>();
    for (const s of studySets) m.set(s._id, s);
    return m;
  }, [studySets]);

  const visible = useMemo(
    () => deadlines.filter((d) => matchesFilter(d, filter)),
    [deadlines, filter],
  );

  const counts = useMemo(() => {
    const c: Record<DeadlineFilter, number> = {
      all: deadlines.length,
      today: 0, week: 0, critical: 0, upcoming: 0, passed: 0,
    };
    for (const d of deadlines) {
      for (const f of ['today', 'week', 'critical', 'upcoming', 'passed'] as DeadlineFilter[]) {
        if (matchesFilter(d, f)) c[f] += 1;
      }
    }
    return c;
  }, [deadlines]);

  async function refresh() {
    try {
      const next = await listDeadlines({ filter: 'all' });
      setDeadlines(next);
    } catch {
      // soft-fail; UI already updated optimistically
    }
  }

  async function handleCreate(input: CreateDeadlineInput) {
    const created = await createDeadline(input);
    setDeadlines((prev) => [...prev, created]);
    toast.success('Deadline added.');
  }

  async function handleUpdate(id: string, patch: UpdateDeadlineInput) {
    const updated = await updateDeadline(id, patch);
    setDeadlines((prev) => prev.map((d) => (d.id === id ? updated : d)));
    toast.success('Deadline updated.');
  }

  async function handleSnooze(d: Deadline, until: Date) {
    const prev = deadlines;
    setDeadlines(prev.map((x) => (x.id === d.id ? { ...x, snoozeUntil: until.toISOString() } : x)));
    try {
      const updated = await snoozeDeadline(d.id, until.toISOString());
      setDeadlines((curr) => curr.map((x) => (x.id === d.id ? updated : x)));
      toast.success(`Snoozed until ${until.toLocaleDateString()}.`);
    } catch {
      setDeadlines(prev);
      toast.error('Snooze failed.');
    }
  }

  async function handleMarkPassed(d: Deadline) {
    const prev = deadlines;
    const nowIso = new Date().toISOString();
    setDeadlines(prev.map((x) => (x.id === d.id ? { ...x, passedAt: nowIso } : x)));
    try {
      const updated = await markDeadlinePassed(d.id);
      setDeadlines((curr) => curr.map((x) => (x.id === d.id ? updated : x)));
      toast.success('Marked done.', {
        action: {
          label: 'Undo',
          onClick: () => { void handleUnmarkPassed({ ...d, passedAt: nowIso }); },
        },
      });
    } catch {
      setDeadlines(prev);
      toast.error('Failed to mark done.');
    }
  }

  async function handleUnmarkPassed(d: Deadline) {
    const prev = deadlines;
    setDeadlines(prev.map((x) => (x.id === d.id ? { ...x, passedAt: null } : x)));
    try {
      const updated = await unmarkDeadlinePassed(d.id);
      setDeadlines((curr) => curr.map((x) => (x.id === d.id ? updated : x)));
      toast.success('Marked as not done.');
    } catch {
      setDeadlines(prev);
      toast.error('Failed to unmark.');
    }
  }

  async function handleDelete(d: Deadline) {
    const prev = deadlines;
    setDeadlines(prev.filter((x) => x.id !== d.id));
    try {
      await deleteDeadline(d.id);
      toast.success('Deadline deleted.');
    } catch {
      setDeadlines(prev);
      toast.error('Failed to delete deadline.');
    }
  }

  function requestDelete(d: Deadline) {
    const diff = daysUntil(d.date);
    if (!d.passedAt && diff >= 0 && diff <= 3) {
      setConfirmDelete(d);
    } else {
      void handleDelete(d);
    }
  }

  return (
    <>
      <div className="flex items-center justify-between mb-section-y">
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-medium border transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
                filter === f.id
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-surface text-foreground-muted border-border hover:text-foreground hover:bg-surface-2',
              )}
            >
              {f.label}
              <span className="ml-1.5 font-mono opacity-70">{counts[f.id]}</span>
            </button>
          ))}
        </div>
        <Button
          size="sm"
          onClick={() => {
            setEditTarget(null);
            setDialogOpen(true);
          }}
        >
          <Plus size={14} aria-hidden="true" className="mr-1" />
          New deadline
        </Button>
      </div>

      <DeadlineList
        deadlines={visible}
        studySetsById={studySetsById}
        onEdit={(d) => {
          setEditTarget(d);
          setDialogOpen(true);
        }}
        onDelete={requestDelete}
        onSnooze={handleSnooze}
        onMarkPassed={handleMarkPassed}
        onUnmarkPassed={handleUnmarkPassed}
        onNew={() => {
          setEditTarget(null);
          setDialogOpen(true);
        }}
        isFiltered={filter !== 'all' || deadlines.length > 0}
      />

      <DeadlineDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditTarget(null);
        }}
        studySets={studySets}
        initial={editTarget}
        onCreate={async (input) => {
          await handleCreate(input);
          await refresh();
        }}
        onUpdate={async (id, patch) => {
          await handleUpdate(id, patch);
          await refresh();
        }}
      />

      <AlertDialog
        open={confirmDelete !== null}
        onOpenChange={(open) => { if (!open) setConfirmDelete(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete deadline?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDelete && (
                <>
                  <span className="font-medium">{confirmDelete.label}</span> is within 3&nbsp;days. Deleting will remove it from Now Brief and stop reminders. This can&apos;t be undone.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmDelete) void handleDelete(confirmDelete);
                setConfirmDelete(null);
              }}
              className="bg-[hsl(var(--danger))] text-white hover:bg-[hsl(var(--danger))]/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
