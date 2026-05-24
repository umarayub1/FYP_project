'use client';

import { useState, useEffect } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { type Deadline, type DeadlinePayload, addDeadline, updateDeadline, deleteDeadline } from '@/lib/api/study-sets';

interface DeadlineEditorPopoverProps {
  trigger: React.ReactNode;
  studySetId: string;
  initial?: Partial<Deadline>;
  onSaved: (deadline: Deadline) => void;
  onDeleted?: () => void;
  defaultOpen?: boolean;
}

const TYPE_LABELS: Record<Deadline['type'], string> = {
  exam:       'Final Exam',
  quiz:       'Quiz',
  assignment: 'Assignment',
  custom:     '',
};

function dayDiff(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + 'T00:00:00');
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

function livePreview(label: string, dateStr: string): string {
  if (!dateStr || !label) return '';
  const diff = dayDiff(dateStr);
  if (diff < 0) return `${label} (${Math.abs(diff)} day${Math.abs(diff) !== 1 ? 's' : ''} ago)`;
  if (diff === 0) return `${label} today`;
  if (diff === 1) return `${label} tomorrow`;
  return `${label} in ${diff} days`;
}

export function DeadlineEditorPopover({
  trigger,
  studySetId,
  initial,
  onSaved,
  onDeleted,
  defaultOpen = false,
}: DeadlineEditorPopoverProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [type, setType] = useState<Deadline['type']>(initial?.type ?? 'exam');
  const [label, setLabel] = useState(initial?.label ?? TYPE_LABELS['exam']);
  const [date, setDate] = useState(initial?.date ?? '');
  const [notify, setNotify] = useState<number[]>(initial?.notifyDaysBefore ?? [7, 3, 1]);
  const [saving, setSaving] = useState(false);
  const [pastDateWarning, setPastDateWarning] = useState(false);

  const today = new Date().toISOString().split('T')[0];
  const isEdit = Boolean(initial?.id);
  const canSave = label.trim() !== '' && date !== '';
  const isPast = date !== '' && date < today;

  useEffect(() => {
    if (!initial?.label) {
      setLabel(type === 'custom' ? '' : TYPE_LABELS[type]);
    }
  }, [type, initial?.label]);

  function toggleNotify(day: number) {
    setNotify(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    );
  }

  async function handleSave(force = false) {
    if (!canSave) return;
    if (isPast && !force) {
      setPastDateWarning(true);
      return;
    }
    setSaving(true);
    try {
      const payload: DeadlinePayload = { type, label: label.trim(), date, notifyDaysBefore: notify };
      const saved = isEdit && initial?.id
        ? await updateDeadline(studySetId, initial.id, payload)
        : await addDeadline(studySetId, payload);
      onSaved(saved);
      setOpen(false);
      setPastDateWarning(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!initial?.id) return;
    await deleteDeadline(studySetId, initial.id);
    setOpen(false);
    onDeleted?.();
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent className="w-80" align="start">
        <p className="text-sm font-medium text-foreground mb-3">
          {isEdit ? 'Edit deadline' : 'Add deadline'}
        </p>

        {/* Type */}
        <div className="mb-3">
          <p className="text-xs font-medium text-foreground-muted mb-1.5">Type</p>
          <div className="flex gap-1.5 flex-wrap">
            {(['exam', 'quiz', 'assignment', 'custom'] as const).map(t => (
              <button
                key={t}
                onClick={() => setType(t)}
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
        <div className="mb-3">
          <label htmlFor="deadline-label" className="text-xs font-medium text-foreground-muted block mb-1.5">
            Label <span aria-hidden="true">*</span>
          </label>
          <input
            id="deadline-label"
            type="text"
            value={label}
            onChange={e => setLabel(e.target.value)}
            aria-required="true"
            placeholder={type === 'custom' ? 'e.g. Portfolio review' : TYPE_LABELS[type]}
            className="w-full rounded-md border border-border bg-surface-2 px-3 py-1.5 text-sm text-foreground placeholder:text-foreground-subtle outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          />
        </div>

        {/* Date */}
        <div className="mb-3">
          <label htmlFor="deadline-date" className="text-xs font-medium text-foreground-muted block mb-1.5">
            Date <span aria-hidden="true">*</span>
          </label>
          <input
            id="deadline-date"
            type="date"
            value={date}
            min={today}
            onChange={e => { setDate(e.target.value); setPastDateWarning(false); }}
            aria-required="true"
            className="w-full rounded-md border border-border bg-surface-2 px-3 py-1.5 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          />
          {date && label && (
            <p className="mt-1.5 text-xs text-foreground-muted italic">
              {livePreview(label, date)}
            </p>
          )}
        </div>

        {/* Remind me */}
        <div className="mb-4">
          <p className="text-xs font-medium text-foreground-muted mb-1.5">Remind me</p>
          <div className="grid grid-cols-2 gap-1.5">
            {[{ days: 7, label: '1 week before' }, { days: 3, label: '3 days before' }, { days: 1, label: '1 day before' }, { days: 0, label: 'Same day' }].map(({ days, label: rLabel }) => (
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
          <div className="mb-3 rounded-md bg-warning/10 border border-warning/30 p-3 text-xs text-foreground">
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

        {/* Footer */}
        <div className="flex items-center justify-between gap-2">
          {isEdit ? (
            <Button size="sm" variant="outline" onClick={handleDelete} className="text-xs h-7 text-destructive border-destructive/30 hover:bg-destructive/10">
              Delete
            </Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)} className="text-xs h-7">
              Cancel
            </Button>
            <Button size="sm" onClick={() => handleSave()} disabled={!canSave || saving} className="text-xs h-7">
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
