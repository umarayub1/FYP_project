'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarDays } from 'lucide-react';
import { toast } from 'sonner';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { addDeadline, updateDeadline, type Deadline, type DeadlinePayload } from '@/lib/api/study-sets';

type DeadlineType = 'exam' | 'quiz' | 'assignment' | 'custom';

const TYPE_LABELS: Record<DeadlineType, string> = {
  exam: 'Final Exam',
  quiz: 'Quiz',
  assignment: 'Assignment',
  custom: '',
};

const REMIND_OPTIONS = [
  { days: 7, label: '1 week before' },
  { days: 3, label: '3 days before' },
  { days: 1, label: '1 day before' },
  { days: 0, label: 'Same day' },
];

function dayDiff(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + 'T00:00:00');
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

function previewString(label: string, date: string): string {
  if (!label || !date) return '';
  const diff = dayDiff(date);
  if (diff < 0) return `${label} — ${Math.abs(diff)} days ago`;
  if (diff === 0) return `${label} — today`;
  if (diff === 1) return `${label} — tomorrow`;
  return `${label} in ${diff} days`;
}

interface Props {
  setId: string;
  existingDeadline?: Deadline | null;
  autoOpen?: boolean;
}

export function DeadlineEditorWidget({ setId, existingDeadline, autoOpen }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(autoOpen ?? false);
  const [saving, setSaving] = useState(false);

  const initType = (existingDeadline?.type ?? 'exam') as DeadlineType;
  const initLabel = existingDeadline?.label ?? TYPE_LABELS['exam'];
  const initDate = existingDeadline?.date ?? '';
  const initRemind = existingDeadline?.notifyDaysBefore ?? [7, 3, 1];

  const [type, setType] = useState<DeadlineType>(initType);
  const [label, setLabel] = useState(initLabel);
  const [date, setDate] = useState(initDate);
  const [remind, setRemind] = useState<number[]>(initRemind);

  function handleTypeChange(t: DeadlineType) {
    setType(t);
    setLabel(TYPE_LABELS[t]);
  }

  function toggleRemind(days: number) {
    setRemind(prev => prev.includes(days) ? prev.filter(d => d !== days) : [...prev, days]);
  }

  function handleOpenChange(o: boolean) {
    if (o) {
      setType(initType);
      setLabel(initLabel);
      setDate(initDate);
      setRemind(initRemind);
    }
    setOpen(o);
  }

  async function handleSave() {
    if (!date) return;
    setSaving(true);
    try {
      const payload: DeadlinePayload = {
        type,
        label: label.trim() || TYPE_LABELS[type] || 'Deadline',
        date,
        notifyDaysBefore: remind,
      };
      if (existingDeadline) {
        await updateDeadline(setId, existingDeadline.id, payload);
      } else {
        await addDeadline(setId, payload);
      }
      setOpen(false);
      router.refresh();
    } catch {
      toast.error('Failed to save deadline');
    } finally {
      setSaving(false);
    }
  }

  const preview = previewString(label.trim() || TYPE_LABELS[type], date);

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        {existingDeadline ? (
          <button
            className="flex items-center gap-1.5 text-sm text-foreground-muted hover:text-foreground transition-colors px-2 py-1 rounded-md hover:bg-surface-2 cursor-pointer"
            aria-label={`Edit deadline: ${existingDeadline.label}`}
          >
            <CalendarDays className="h-4 w-4" aria-hidden="true" />
            <span>{existingDeadline.label}</span>
          </button>
        ) : (
          <button
            className="flex items-center gap-1.5 text-sm text-foreground-muted hover:text-foreground transition-colors px-2 py-1 rounded-md hover:bg-surface-2 border border-dashed border-border cursor-pointer"
            aria-label="Add deadline"
          >
            <CalendarDays className="h-4 w-4" aria-hidden="true" />
            <span>Add deadline</span>
          </button>
        )}
      </PopoverTrigger>

      <PopoverContent className="w-80 p-4" align="end">
        <div className="space-y-4">
          {/* Type */}
          <fieldset>
            <legend className="text-[13px] font-medium text-foreground mb-2">Type</legend>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              {(['exam', 'quiz', 'assignment', 'custom'] as DeadlineType[]).map(t => (
                <label key={t} className="flex items-center gap-1.5 text-[13px] text-foreground cursor-pointer">
                  <input
                    type="radio"
                    name="deadline-type"
                    value={t}
                    checked={type === t}
                    onChange={() => handleTypeChange(t)}
                    className="cursor-pointer"
                  />
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </label>
              ))}
            </div>
          </fieldset>

          {/* Label */}
          <div>
            <label className="block text-[13px] font-medium text-foreground mb-1" htmlFor="dl-label">
              Label
            </label>
            <input
              id="dl-label"
              type="text"
              value={label}
              onChange={e => setLabel(e.target.value)}
              placeholder="e.g. Final Exam"
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-[13px] text-foreground placeholder:text-foreground-subtle focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* Date */}
          <div>
            <label className="block text-[13px] font-medium text-foreground mb-1" htmlFor="dl-date">
              Date
            </label>
            <input
              id="dl-date"
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-[13px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* Remind me */}
          <fieldset>
            <legend className="text-[13px] font-medium text-foreground mb-2">Remind me</legend>
            <div className="space-y-1.5">
              {REMIND_OPTIONS.map(opt => (
                <label key={opt.days} className="flex items-center gap-2 text-[13px] text-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={remind.includes(opt.days)}
                    onChange={() => toggleRemind(opt.days)}
                    className="cursor-pointer"
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </fieldset>

          {/* Preview */}
          {preview && (
            <p className="text-[12px] text-foreground-muted bg-surface-2 rounded px-3 py-2">
              Preview: <span className="font-medium text-foreground">{preview}</span>
            </p>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-1 border-t border-border">
            <button
              onClick={() => setOpen(false)}
              className="px-3 py-1.5 text-[13px] rounded-md text-foreground-muted hover:text-foreground hover:bg-surface-2 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!date || saving}
              className="px-3 py-1.5 text-[13px] rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
