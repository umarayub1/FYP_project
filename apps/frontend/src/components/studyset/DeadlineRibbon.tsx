'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import Link from 'next/link';
import { type Deadline, type StudySet, type SetAnalytics } from '@/lib/api/study-sets';

interface DeadlineRibbonProps {
  deadline: Deadline | null;
  set: StudySet;
  analytics: SetAnalytics | null;
  setId: string;
}

function dayDiff(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + 'T00:00:00');
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

export function DeadlineRibbon({ deadline, analytics, setId }: DeadlineRibbonProps) {
  const [dismissed, setDismissed] = useState(false);

  if (!deadline || dismissed) return null;

  const daysUntil = dayDiff(deadline.date);

  // DEADLINE_SOON (4–7 days): no ribbon — handled by sidebar dot
  // UPCOMING (>7 days): no ribbon
  if (daysUntil > 3) return null;

  const dueCount     = analytics?.dueCards     ?? 0;
  const overdueCount = analytics?.overdueCards  ?? 0;
  const hrsRemaining = ((dueCount * 2 + overdueCount * 1.5) / 60).toFixed(1);
  const hrsAvailable = (daysUntil * 1.5).toFixed(1);
  const onTrack      = parseFloat(hrsAvailable) >= parseFloat(hrsRemaining);

  // DEADLINE_TODAY
  if (daysUntil === 0) {
    return (
      <div
        className="rounded-lg border-l-[3px] border-danger bg-danger-soft px-4 py-3 mb-6"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        aria-label={`${deadline.label} deadline is today`}
      >
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm">
            <span className="font-medium text-danger">{deadline.label}</span>
            <span className="text-foreground-muted"> is today.</span>
          </p>
          <Link
            href={`/sets/${setId}/flashcards`}
            className="shrink-0 rounded-md bg-danger/10 px-3 py-1 text-xs font-medium text-danger hover:bg-danger/20 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger"
          >
            Start Review
          </Link>
        </div>
      </div>
    );
  }

  // DEADLINE_CRITICAL (≤3 days)
  return (
    <div
      className="rounded-lg border-l-[3px] border-warning bg-warning-soft px-4 py-3 mb-6"
      role="status"
      aria-live="polite"
      aria-atomic="true"
      aria-label={`${deadline.label} deadline in ${daysUntil} days`}
    >
      <div className="flex items-center gap-4">
        <p className="flex-1 text-sm text-foreground-muted">
          <span className="font-medium text-warning">{deadline.label}</span>
          {' in '}
          <span className="font-mono">{daysUntil}</span>
          {' days · At current pace: ~'}
          <span className="font-mono">{hrsRemaining}</span>
          {' hrs remaining, '}
          <span className="font-mono">{hrsAvailable}</span>
          {' hrs available. '}
          <span className={onTrack ? 'text-success font-medium' : 'text-danger font-medium'}>
            {onTrack ? 'On track.' : 'Needs attention.'}
          </span>
        </p>
        <button
          onClick={() => setDismissed(true)}
          className="shrink-0 rounded p-1 text-foreground-muted hover:text-foreground hover:bg-warning/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warning cursor-pointer"
          aria-label="Dismiss deadline ribbon"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
