'use client';

import { CalendarClock, Plus } from 'lucide-react';
import { DeadlineRow } from './DeadlineRow';
import { EmptyState } from '@/components/patterns/EmptyState';
import { Button } from '@/components/ui/button';
import type { Deadline } from '@/lib/api/deadlines';
import type { StudySet } from '@/lib/api/study-sets';

interface DeadlineListProps {
  deadlines: Deadline[];
  studySetsById: Map<string, StudySet>;
  onEdit: (d: Deadline) => void;
  onDelete: (d: Deadline) => void;
  onSnooze: (d: Deadline, snoozeUntil: Date) => void;
  onMarkPassed: (d: Deadline) => void;
  onUnmarkPassed: (d: Deadline) => void;
  onNew?: () => void;
  isFiltered?: boolean;
}

interface Group {
  key: string;
  label: string;
  deadlines: Deadline[];
}

export function DeadlineList({
  deadlines,
  studySetsById,
  onEdit,
  onDelete,
  onSnooze,
  onMarkPassed,
  onUnmarkPassed,
  onNew,
  isFiltered = false,
}: DeadlineListProps) {
  const groups = groupDeadlines(deadlines, studySetsById);

  if (deadlines.length === 0) {
    if (isFiltered) {
      return (
        <div className="rounded-md border border-border bg-surface p-8 text-center text-sm text-foreground-muted">
          No deadlines match this filter.
        </div>
      );
    }
    return (
      <EmptyState
        icon={<CalendarClock className="h-6 w-6" aria-hidden="true" />}
        headline="No deadlines tracked."
        subline="Add one to surface upcoming exams and assignments in Now Brief."
        action={
          onNew ? (
            <Button onClick={onNew}>
              <Plus className="h-4 w-4 mr-1" aria-hidden="true" />
              Add a deadline
            </Button>
          ) : undefined
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      {groups.map((g) => (
        <section key={g.key}>
          <h2 className="text-[11px] font-mono uppercase tracking-wider text-foreground-subtle mb-2">
            {g.label}
            <span className="ml-2 text-foreground-muted">{g.deadlines.length}</span>
          </h2>
          <div className="space-y-2">
            {g.deadlines.map((d) => (
              <DeadlineRow
                key={d.id}
                deadline={d}
                studySet={d.studySetId ? studySetsById.get(d.studySetId) : undefined}
                onEdit={onEdit}
                onDelete={onDelete}
                onSnooze={onSnooze}
                onMarkPassed={onMarkPassed}
                onUnmarkPassed={onUnmarkPassed}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function groupDeadlines(
  deadlines: Deadline[],
  studySetsById: Map<string, StudySet>,
): Group[] {
  const map = new Map<string, Group>();
  for (const d of deadlines) {
    const key = d.studySetId ?? '__personal__';
    const label = d.studySetId
      ? studySetsById.get(d.studySetId)?.name ?? 'Archived / Unknown Set'
      : 'Personal';
    const existing = map.get(key);
    if (existing) {
      existing.deadlines.push(d);
    } else {
      map.set(key, { key, label, deadlines: [d] });
    }
  }
  for (const g of map.values()) {
    g.deadlines.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }
  return Array.from(map.values()).sort((a, b) => {
    if (a.key === '__personal__') return 1;
    if (b.key === '__personal__') return -1;
    return a.label.localeCompare(b.label);
  });
}
