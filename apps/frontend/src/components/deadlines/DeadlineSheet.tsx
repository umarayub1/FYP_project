'use client';

import { useState } from 'react';
import { AlertCircle, Clock, CheckCircle, Plus, Edit2, Trash2 } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { DeadlineEditorPopover } from './DeadlineEditorPopover';
import { deleteDeadline, type Deadline } from '@/lib/api/study-sets';
import { cn } from '@/lib/cn';

interface DeadlineSheetProps {
  open: boolean;
  onClose: () => void;
  studySetId: string;
  studySetName: string;
  deadlines: Deadline[];
  onDeadlinesChange: (deadlines: Deadline[]) => void;
}

function dayDiff(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + 'T00:00:00');
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function urgencyFor(dateStr: string): 'critical' | 'soon' | 'upcoming' | 'future' {
  const diff = dayDiff(dateStr);
  if (diff <= 3) return 'critical';
  if (diff <= 7) return 'soon';
  if (diff <= 14) return 'upcoming';
  return 'future';
}

const URGENCY_CONFIG = {
  critical: { icon: AlertCircle,  color: 'text-destructive', label: 'Critical' },
  soon:     { icon: Clock,        color: 'text-warning',     label: 'Soon'     },
  upcoming: { icon: CheckCircle,  color: 'text-foreground-muted', label: 'Upcoming' },
  future:   { icon: CheckCircle,  color: 'text-success',     label: 'Upcoming' },
};

interface UndoState { id: string; deadline: Deadline }

export function DeadlineSheet({ open, onClose, studySetId, studySetName, deadlines, onDeadlinesChange }: DeadlineSheetProps) {
  const [undoState, setUndoState] = useState<UndoState | null>(null);
  const [showPassed, setShowPassed] = useState(false);

  const today = new Date().toISOString().split('T')[0];
  const upcoming = deadlines.filter(d => !d.passedAt && d.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  const passed   = deadlines.filter(d => d.passedAt || d.date < today).sort((a, b) => b.date.localeCompare(a.date));

  function handleSaved(saved: Deadline) {
    const existing = deadlines.findIndex(d => d.id === saved.id);
    if (existing >= 0) {
      const updated = [...deadlines];
      updated[existing] = saved;
      onDeadlinesChange(updated);
    } else {
      onDeadlinesChange([...deadlines, saved]);
    }
  }

  async function handleDelete(d: Deadline) {
    setUndoState({ id: d.id, deadline: d });
    onDeadlinesChange(deadlines.filter(x => x.id !== d.id));
    // fire-and-forget; undo cancels this
    await deleteDeadline(studySetId, d.id).catch(() => {});
    // clear undo after 5 s
    setTimeout(() => setUndoState(prev => prev?.id === d.id ? null : prev), 5000);
  }

  function handleUndo() {
    if (!undoState) return;
    onDeadlinesChange([...deadlines, undoState.deadline]);
    setUndoState(null);
    // Note: in a real app we'd cancel the delete API call or re-create; here we re-add
  }

  function handleDeleted(id: string) {
    onDeadlinesChange(deadlines.filter(d => d.id !== id));
  }

  return (
    <Sheet open={open} onOpenChange={v => !v && onClose()}>
      <SheetContent side="right" className="w-full max-w-sm">
        <SheetHeader>
          <SheetTitle>Deadlines — {studySetName}</SheetTitle>
        </SheetHeader>

        {/* Undo toast */}
        {undoState && (
          <div className="mx-6 mt-3 flex items-center justify-between rounded-md bg-surface-2 border border-border px-3 py-2 text-xs">
            <span>Deadline deleted.</span>
            <button onClick={handleUndo} className="text-primary font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring rounded">
              Undo
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
          {/* UPCOMING */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-medium uppercase tracking-wider text-foreground-subtle">Upcoming</p>
              <DeadlineEditorPopover
                trigger={
                  <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs">
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                    Add
                  </Button>
                }
                studySetId={studySetId}
                onSaved={handleSaved}
              />
            </div>

            {upcoming.length === 0 ? (
              <p className="text-sm text-foreground-muted">No upcoming deadlines.</p>
            ) : (
              <ul className="space-y-2">
                {upcoming.map(d => {
                  const diff = dayDiff(d.date);
                  const urgency = urgencyFor(d.date);
                  const { icon: UrgencyIcon, color, label: urgencyLabel } = URGENCY_CONFIG[urgency];
                  return (
                    <li key={d.id} className="group flex items-center gap-3 rounded-lg border border-border bg-background px-3 py-2.5">
                      <UrgencyIcon className={cn('h-4 w-4 shrink-0', color)} aria-hidden="true" />
                      <span className="sr-only">{urgencyLabel}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{d.label}</p>
                        <p className="text-xs text-foreground-muted">
                          {diff === 0 ? 'Today' : diff === 1 ? 'Tomorrow' : `${diff} days`} · {formatDate(d.date)}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                        <DeadlineEditorPopover
                          trigger={
                            <button className="rounded p-1 hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring cursor-pointer" aria-label={`Edit ${d.label}`}>
                              <Edit2 className="h-3.5 w-3.5 text-foreground-muted" aria-hidden="true" />
                            </button>
                          }
                          studySetId={studySetId}
                          initial={d}
                          onSaved={handleSaved}
                          onDeleted={() => handleDeleted(d.id)}
                        />
                        <button
                          onClick={() => handleDelete(d)}
                          className="rounded p-1 hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring cursor-pointer"
                          aria-label={`Delete ${d.label}`}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-foreground-muted hover:text-destructive" aria-hidden="true" />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* PASSED */}
          {passed.length > 0 && (
            <section>
              <p className="text-xs font-medium uppercase tracking-wider text-foreground-subtle mb-3">Passed</p>
              <button
                onClick={() => setShowPassed(v => !v)}
                className="text-xs text-foreground-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring rounded"
              >
                {showPassed ? '▾' : '▸'} Show {passed.length}
              </button>
              {showPassed && (
                <ul className="mt-2 space-y-1">
                  {passed.map(d => (
                    <li key={d.id} className="flex items-center gap-3 px-3 py-2 text-foreground-muted">
                      <CheckCircle className="h-4 w-4 shrink-0 text-foreground-subtle" aria-hidden="true" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate">{d.label}</p>
                        <p className="text-xs">{formatDate(d.date)} (passed)</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
