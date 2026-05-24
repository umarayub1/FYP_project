'use client';

import Link from 'next/link';
import { MoreHorizontal, BookOpen, FileText, ClipboardList, Star, MoonStar, CheckCircle2, Trash2, Edit3, Check, Circle, RotateCcw } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/cn';
import type { Deadline, DeadlineType } from '@/lib/api/deadlines';
import type { StudySet } from '@/lib/api/study-sets';

const TYPE_ICON: Record<DeadlineType, typeof BookOpen> = {
  exam:       Star,
  quiz:       BookOpen,
  assignment: ClipboardList,
  custom:     FileText,
};

const TYPE_LABEL: Record<DeadlineType, string> = {
  exam:       'Exam',
  quiz:       'Quiz',
  assignment: 'Assignment',
  custom:     'Custom',
};

function daysUntil(iso: string): number {
  const target = new Date(iso);
  target.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function daysRemainingLabel(iso: string, passedAt: string | null): string {
  if (passedAt) return 'Done';
  const diff = daysUntil(iso);
  if (diff < 0) return `${Math.abs(diff)}d ago`;
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  return `in ${diff}d`;
}

function snoozeUntilLabel(iso: string | null): string | null {
  if (!iso) return null;
  const until = new Date(iso);
  if (until.getTime() <= Date.now()) return null;
  return until.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

interface DeadlineRowProps {
  deadline: Deadline;
  studySet?: StudySet;
  onEdit: (d: Deadline) => void;
  onDelete: (d: Deadline) => void;
  onSnooze: (d: Deadline, snoozeUntil: Date) => void;
  onMarkPassed: (d: Deadline) => void;
  onUnmarkPassed: (d: Deadline) => void;
}

export function DeadlineRow({
  deadline,
  studySet,
  onEdit,
  onDelete,
  onSnooze,
  onMarkPassed,
  onUnmarkPassed,
}: DeadlineRowProps) {
  const Icon = TYPE_ICON[deadline.type];
  const diff = daysUntil(deadline.date);
  const passed = Boolean(deadline.passedAt);
  const snoozeLabel = snoozeUntilLabel(deadline.snoozeUntil);

  const tone =
    passed
      ? 'border-border opacity-60'
      : diff < 0
      ? 'border-border'
      : diff <= 3
      ? 'border-l-2 border-l-[hsl(var(--danger))]'
      : diff <= 7
      ? 'border-l-2 border-l-[hsl(var(--warning))]'
      : 'border-border';

  function snoozeBy(days: number) {
    const until = new Date();
    until.setDate(until.getDate() + days);
    onSnooze(deadline, until);
  }

  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-md bg-surface px-3 py-3 border',
        tone,
      )}
    >
      <button
        type="button"
        onClick={() => (passed ? onUnmarkPassed(deadline) : onMarkPassed(deadline))}
        aria-label={passed ? `Mark ${deadline.label} as not done` : `Mark ${deadline.label} as done`}
        aria-pressed={passed ? 'true' : 'false'}
        className={cn(
          'flex-none w-5 h-5 rounded-full border flex items-center justify-center transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
          passed
            ? 'bg-[hsl(var(--success))] border-[hsl(var(--success))] text-white hover:bg-[hsl(var(--success))]/85'
            : 'border-foreground-subtle/40 text-transparent hover:border-foreground-muted hover:bg-surface-2',
        )}
      >
        {passed
          ? <Check size={12} strokeWidth={3} aria-hidden="true" />
          : <Circle size={12} className="opacity-0" aria-hidden="true" />}
      </button>

      <div className="flex-none w-6 h-6 rounded bg-surface-2 flex items-center justify-center text-foreground-muted">
        <Icon size={14} aria-hidden="true" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[10px] uppercase tracking-wider font-mono text-foreground-subtle">
            {TYPE_LABEL[deadline.type]}
          </span>
          <span
            className={cn(
              'text-sm font-medium text-foreground truncate',
              passed && 'line-through text-foreground-muted',
            )}
          >
            {deadline.label}
          </span>
          {snoozeLabel && (
            <span className="text-[10px] font-mono text-foreground-muted bg-surface-2 rounded px-1.5 py-0.5">
              <MoonStar size={9} aria-hidden="true" className="inline mr-0.5" />
              snoozed → {snoozeLabel}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 mt-0.5 text-[12px] text-foreground-muted">
          <span className="font-mono">{formatDate(deadline.date)}</span>
          <span aria-hidden="true">·</span>
          <span
            className={cn(
              'font-mono',
              !passed && diff <= 3 && diff >= 0 && 'text-[hsl(var(--danger))]',
              !passed && diff > 3 && diff <= 7 && 'text-[hsl(var(--warning))]',
              passed && 'italic',
            )}
          >
            {daysRemainingLabel(deadline.date, deadline.passedAt)}
          </span>
          {studySet ? (
            <>
              <span aria-hidden="true">·</span>
              <Link
                href={`/sets/${studySet._id}`}
                className="hover:text-foreground underline-offset-2 hover:underline truncate"
              >
                {studySet.name}
              </Link>
            </>
          ) : !deadline.studySetId ? (
            <>
              <span aria-hidden="true">·</span>
              <span className="italic text-foreground-subtle">Personal</span>
            </>
          ) : null}
        </div>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`Actions for ${deadline.label}`}
            className="flex items-center justify-center w-7 h-7 rounded hover:bg-surface-2 text-foreground-muted hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          >
            <MoreHorizontal size={14} aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onSelect={() => onEdit(deadline)}>
            <Edit3 size={12} className="mr-2" aria-hidden="true" />
            Edit
          </DropdownMenuItem>
          {!passed && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-foreground-subtle">
                Snooze
              </DropdownMenuLabel>
              <DropdownMenuItem onSelect={() => snoozeBy(1)}>
                <MoonStar size={12} className="mr-2" aria-hidden="true" />
                1 day
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => snoozeBy(7)}>
                <MoonStar size={12} className="mr-2" aria-hidden="true" />
                1 week
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => {
                  const input = window.prompt('Snooze until (YYYY-MM-DD):');
                  if (!input) return;
                  const target = new Date(input + 'T00:00:00');
                  if (Number.isNaN(target.getTime())) return;
                  onSnooze(deadline, target);
                }}
              >
                <MoonStar size={12} className="mr-2" aria-hidden="true" />
                Pick date…
              </DropdownMenuItem>
            </>
          )}
          {passed ? (
            <DropdownMenuItem onSelect={() => onUnmarkPassed(deadline)}>
              <RotateCcw size={12} className="mr-2" aria-hidden="true" />
              Mark as not done
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onSelect={() => onMarkPassed(deadline)}>
              <CheckCircle2 size={12} className="mr-2" aria-hidden="true" />
              Mark done
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => onDelete(deadline)}
            className="text-[hsl(var(--danger))]"
          >
            <Trash2 size={12} className="mr-2" aria-hidden="true" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
