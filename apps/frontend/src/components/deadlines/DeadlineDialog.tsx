'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import type { Deadline, CreateDeadlineInput, UpdateDeadlineInput, DeadlineType } from '@/lib/api/deadlines';
import type { StudySet } from '@/lib/api/study-sets';

const TYPE_LABELS: Record<DeadlineType, string> = {
  exam:       'Final Exam',
  quiz:       'Quiz',
  assignment: 'Assignment',
  custom:     '',
};

const REMIND_OPTIONS = [
  { days: 7, label: '1 week before' },
  { days: 3, label: '3 days before' },
  { days: 1, label: '1 day before' },
  { days: 0, label: 'Same day' },
];

function toDateInputValue(iso: string | undefined): string {
  if (!iso) return '';
  return iso.slice(0, 10);
}

interface DeadlineDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studySets: StudySet[];
  initial?: Deadline | null;
  onCreate: (input: CreateDeadlineInput) => Promise<void>;
  onUpdate: (id: string, patch: UpdateDeadlineInput) => Promise<void>;
}

export function DeadlineDialog({
  open,
  onOpenChange,
  studySets,
  initial,
  onCreate,
  onUpdate,
}: DeadlineDialogProps) {
  const isEdit = Boolean(initial?.id);

  const [type, setType] = useState<DeadlineType>('exam');
  const [label, setLabel] = useState<string>(TYPE_LABELS.exam);
  const [date, setDate] = useState<string>('');
  const [studySetId, setStudySetId] = useState<string>('');
  const [notify, setNotify] = useState<number[]>([7, 3, 1]);
  const [saving, setSaving] = useState(false);
  const [pastDateWarning, setPastDateWarning] = useState(false);

  useEffect(() => {
    if (!open) return;
    setType(initial?.type ?? 'exam');
    setLabel(initial?.label ?? TYPE_LABELS.exam);
    setDate(toDateInputValue(initial?.date ?? undefined));
    setStudySetId(initial?.studySetId ?? '');
    setNotify(initial?.notifyDaysBefore ?? [7, 3, 1]);
    setPastDateWarning(false);
  }, [open, initial]);

  useEffect(() => {
    if (!initial && !isEdit) {
      // Auto-fill label from type if user hasn't typed a custom one
      setLabel((current) => {
        const matchedDefault = (Object.values(TYPE_LABELS) as string[]).includes(current);
        if (matchedDefault || current.trim() === '') {
          return type === 'custom' ? '' : TYPE_LABELS[type];
        }
        return current;
      });
    }
  }, [type, initial, isEdit]);

  const today = new Date().toISOString().split('T')[0];
  const canSave = label.trim() !== '' && date !== '';
  const isPast = date !== '' && date < today;

  function toggleNotify(day: number) {
    setNotify((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]));
  }

  async function handleSave(force = false) {
    if (!canSave) return;
    if (isPast && !force) {
      setPastDateWarning(true);
      return;
    }
    setSaving(true);
    try {
      const payload = {
        type,
        label:            label.trim(),
        date:             new Date(date + 'T00:00:00').toISOString(),
        notifyDaysBefore: notify.slice().sort((a, b) => a - b),
        studySetId:       studySetId === '' ? null : studySetId,
      };
      if (isEdit && initial) {
        await onUpdate(initial.id, payload);
      } else {
        await onCreate(payload);
      }
      onOpenChange(false);
      setPastDateWarning(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit deadline' : 'New deadline'}</DialogTitle>
          <DialogDescription className="sr-only">
            Create or edit a deadline. Choose a type, label, date, and which study set it belongs to.
          </DialogDescription>
        </DialogHeader>

        {/* Type */}
        <div>
          <p className="text-xs font-medium text-foreground-muted mb-1.5">Type</p>
          <div className="flex gap-1.5 flex-wrap">
            {(['exam', 'quiz', 'assignment', 'custom'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setType(t)}
                type="button"
                className={cn(
                  'rounded-md px-2.5 py-1 text-xs font-medium capitalize border transition-colors cursor-pointer',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
                  type === t
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-surface-2 text-foreground border-border hover:bg-surface-3'
                )}
              >
                {t === 'exam' ? 'Exam' : t === 'quiz' ? 'Quiz' : t === 'assignment' ? 'Assignment' : 'Custom'}
              </button>
            ))}
          </div>
        </div>

        {/* Label */}
        <div>
          <label htmlFor="deadline-dlg-label" className="text-xs font-medium text-foreground-muted block mb-1.5">
            Label <span aria-hidden="true">*</span>
          </label>
          <input
            id="deadline-dlg-label"
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            aria-required="true"
            maxLength={100}
            placeholder={type === 'custom' ? 'e.g. Portfolio review' : TYPE_LABELS[type]}
            className="w-full rounded-md border border-border bg-surface-2 px-3 py-1.5 text-sm text-foreground placeholder:text-foreground-subtle outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          />
        </div>

        {/* Date */}
        <div>
          <label htmlFor="deadline-dlg-date" className="text-xs font-medium text-foreground-muted block mb-1.5">
            Date <span aria-hidden="true">*</span>
          </label>
          <input
            id="deadline-dlg-date"
            type="date"
            value={date}
            min={isEdit ? undefined : today}
            onChange={(e) => {
              setDate(e.target.value);
              setPastDateWarning(false);
            }}
            aria-required="true"
            className="w-full rounded-md border border-border bg-surface-2 px-3 py-1.5 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-focus-ring font-mono"
          />
        </div>

        {/* Study Set picker */}
        <div>
          <label htmlFor="deadline-dlg-set" className="text-xs font-medium text-foreground-muted block mb-1.5">
            Study set
          </label>
          <select
            id="deadline-dlg-set"
            value={studySetId}
            onChange={(e) => setStudySetId(e.target.value)}
            className="w-full rounded-md border border-border bg-surface-2 px-3 py-1.5 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          >
            <option value="">(Personal — no set)</option>
            {studySets.map((s) => (
              <option key={s._id} value={s._id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        {/* Remind me */}
        <div>
          <p className="text-xs font-medium text-foreground-muted mb-1.5">Remind me</p>
          <div className="grid grid-cols-2 gap-1.5">
            {REMIND_OPTIONS.map(({ days, label: rLabel }) => (
              <label key={days} className="flex items-center gap-2 cursor-pointer text-xs text-foreground">
                <input
                  type="checkbox"
                  checked={notify.includes(days)}
                  onChange={() => toggleNotify(days)}
                  className="accent-primary"
                />
                {rLabel}
              </label>
            ))}
          </div>
        </div>

        {/* Past date warning */}
        {pastDateWarning && (
          <div className="rounded-md bg-warning/10 border border-warning/30 p-3 text-xs text-foreground">
            <p className="font-medium mb-2">This date has already passed. Add it anyway?</p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => handleSave(true)} disabled={saving} className="text-xs h-7">
                Confirm past deadline
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setPastDateWarning(false)} className="text-xs h-7">
                Change date
              </Button>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={() => handleSave()} disabled={!canSave || saving}>
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create deadline'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
