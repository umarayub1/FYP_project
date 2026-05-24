'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';

interface SessionCompleteScreenProps {
  studySetId:     string;
  studySetName:   string;
  reviewedCount:  number;
  goodCount:      number;
  againCount:     number;
  elapsedSeconds: number;
  streakDays?:    number;
  onReviewAgain:  () => void;
}

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

function RetentionSparkline({ accuracy }: { accuracy: number }) {
  const heights =
    accuracy > 60 ? [40, 45, 50, 54, 58, 62, 68] :
    accuracy < 40 ? [60, 55, 50, 48, 44, 40, 38] :
                    [48, 50, 52, 51, 53, 55, 56];

  return (
    <div className="flex items-end gap-1 h-12" aria-hidden="true">
      {heights.map((h, i) => (
        <div
          key={i}
          className="flex-1 rounded-sm bg-[hsl(var(--success)/0.6)]"
          style={{ height: `${h}%` }}
        />
      ))}
    </div>
  );
}

export function SessionCompleteScreen({
  studySetId,
  studySetName,
  reviewedCount,
  goodCount,
  againCount,
  elapsedSeconds,
  streakDays = 0,
  onReviewAgain,
}: SessionCompleteScreenProps) {
  const accuracy = reviewedCount > 0 ? Math.round((goodCount / reviewedCount) * 100) : 0;
  const weeksToTarget = accuracy > 60 ? 3 : accuracy > 40 ? 8 : 16;
  const targetPct     = accuracy > 60 ? 90 : accuracy > 40 ? 80 : 70;

  return (
    <div className="flex flex-col flex-1 items-center justify-center py-12 px-content-x">
      <div className="w-full max-w-[480px]">
        <h2 className="text-h1 text-foreground mb-1 text-center">Session Complete</h2>
        <div className="h-px bg-border my-4" />

        {/* Stats */}
        <div className="grid grid-cols-2 gap-x-8 gap-y-2 mb-6">
          <div className="flex justify-between">
            <span className="text-sm text-foreground-muted">Cards reviewed:</span>
            <span className="text-sm font-mono text-foreground">{reviewedCount}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-foreground-muted">Accuracy:</span>
            <span className="text-sm font-mono text-foreground">{accuracy}%</span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-foreground-muted">Again:</span>
            <span className="text-sm font-mono text-foreground">{againCount}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-foreground-muted">Time:</span>
            <span className="text-sm font-mono text-foreground">{formatElapsed(elapsedSeconds)}</span>
          </div>
          {streakDays > 0 && (
            <div className="flex justify-between col-span-2">
              <span className="text-sm text-foreground-muted">Streak:</span>
              <span className="text-sm font-mono text-foreground">{streakDays} days</span>
            </div>
          )}
        </div>

        {/* Retention forecast sparkline */}
        <div className="rounded-lg border border-border bg-surface-2 p-4 mb-6">
          <p className="text-xs font-medium uppercase tracking-wider text-foreground-subtle mb-3">
            Retention forecast
          </p>
          <RetentionSparkline accuracy={accuracy} />
          <p className="text-sm text-foreground-muted mt-3">
            At this pace,{' '}
            <span className="font-medium text-foreground">{studySetName}</span>{' '}
            retention will reach{' '}
            <span className="font-mono">{targetPct}%</span>{' '}
            in{' '}
            <span className="font-mono">{weeksToTarget} weeks</span>.
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-3 justify-center flex-wrap">
          <Button variant="outline" asChild>
            <Link href={studySetId ? `/sets/${studySetId}` : '/flashcards'}>Done</Link>
          </Button>
          <Button variant="outline" onClick={onReviewAgain}>
            Review Again
          </Button>
          <Button asChild>
            <Link href="/weakpoints">Go to Weak Points</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
