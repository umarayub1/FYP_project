'use client';

import Link from 'next/link';
import { type SetAnalytics } from '@/lib/api/study-sets';

const RING_R = 16;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_R; // ≈ 100.5

interface PulseCardsProps {
  analytics:    SetAnalytics | null;
  setId:        string;
  dueCount:     number;
  overdueCount: number;
  totalCards:   number;
  hasDeadline:  boolean;
}

function ringOffset(ratio: number): number {
  const clamped = Math.max(0, Math.min(1, ratio));
  return RING_CIRCUMFERENCE * (1 - clamped);
}

function RingCircle({
  ratio,
  colorVar,
  label,
}: {
  ratio:    number;
  colorVar: string;
  label:    string;
}) {
  const offset = ringOffset(ratio);
  const color  = `hsl(var(${colorVar}))`;
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" aria-label={label} className="shrink-0">
      <circle
        cx="20" cy="20" r={RING_R}
        fill="none"
        stroke="hsl(var(--border))"
        strokeWidth="4"
      />
      <circle
        cx="20" cy="20" r={RING_R}
        fill="none"
        stroke={color}
        strokeWidth="4"
        strokeDasharray={RING_CIRCUMFERENCE}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform="rotate(-90 20 20)"
      />
    </svg>
  );
}

function Sparkline({ accuracies }: { accuracies: number[] }) {
  const bars   = accuracies.slice(-7);
  const height = 24;
  const bw     = 7;
  const gap    = 3;
  const total  = bars.length * bw + Math.max(0, bars.length - 1) * gap;

  return (
    <svg width={total} height={height} aria-hidden="true">
      {bars.map((acc, i) => {
        const barH  = Math.max(3, (acc / 100) * height);
        const x     = i * (bw + gap);
        const color = acc >= 70 ? 'hsl(var(--success))' : 'hsl(var(--danger))';
        return (
          <rect
            key={i}
            x={x}
            y={height - barH}
            width={bw}
            height={barH}
            rx="2"
            fill={color}
          />
        );
      })}
    </svg>
  );
}

function TrendIndicator({ delta }: { delta: number | undefined }) {
  if (delta === undefined || delta === null) return <span className="font-mono text-foreground-muted">—</span>;
  if (delta > 0)  return <span className="font-mono text-success text-[11px]">↑{delta}%</span>;
  if (delta < 0)  return <span className="font-mono text-danger text-[11px]">↓{Math.abs(delta)}%</span>;
  return <span className="font-mono text-foreground-muted text-[11px]">—</span>;
}

const cardClass =
  'flex flex-col gap-3 rounded-lg bg-surface p-4 border-[0.5px] border-border';

export function PulseCards({
  analytics,
  setId,
  dueCount,
  overdueCount,
  totalCards,
  hasDeadline,
}: PulseCardsProps) {
  // Cards Due card
  const caughtUp       = totalCards > 0 ? (totalCards - dueCount) / totalCards : 1;
  const dueMins        = Math.round(dueCount * 2 + overdueCount * 1.5);
  const dueColorVar    = overdueCount > 0 ? '--danger' : dueCount > 0 ? '--warning' : '--success';

  // Retention card
  const retention      = analytics?.retentionRate;
  const retentionTrend = analytics?.retentionTrend;
  const sessionAcc     = analytics?.sessionAccuracies ?? [];
  const avgEase        = analytics?.avgEaseFactor;
  const totalCardCount = analytics?.totalCards ?? totalCards;

  // Coverage card
  const topicsCovered  = analytics?.topicsWithCoverage;
  const totalTopics    = analytics?.totalTopics;
  const coverageRatio  = topicsCovered != null && totalTopics != null && totalTopics > 0
    ? topicsCovered / totalTopics
    : 0;
  const lastLabel      = analytics?.lastSessionLabel;
  const lastAgo        = analytics?.lastSessionAgo;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
      {/* Cards Due */}
      <div className={cardClass}>
        <p className="section-label">Cards Due</p>
        <div className="flex flex-col items-center gap-2">
          <RingCircle
            ratio={caughtUp}
            colorVar={dueColorVar}
            label={`Cards due ring: ${dueCount} due`}
          />
          <p
            className="font-mono text-2xl font-medium leading-none"
            style={{ color: `hsl(var(${dueColorVar}))` }}
          >
            {dueCount}
          </p>
          <p className="text-[12px] text-foreground-muted text-center">
            {overdueCount > 0 && (
              <><span className="font-mono">{overdueCount}</span> overdue · </>
            )}
            ~<span className="font-mono">{dueMins}</span> min
          </p>
        </div>
        {hasDeadline ? (
          <Link
            href={`/sets/${setId}/flashcards`}
            className="mt-auto rounded-md bg-surface-2 px-3 py-1.5 text-center text-[10px] font-medium text-foreground hover:bg-surface-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          >
            Start Review <kbd className="font-mono opacity-50">⌘R</kbd>
          </Link>
        ) : (
          <Link
            href={`/sets/${setId}?panel=deadlines`}
            className="mt-auto rounded-md bg-surface-2 px-3 py-1.5 text-center text-[10px] font-medium text-foreground-muted hover:text-foreground hover:bg-surface-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          >
            + Set deadline
          </Link>
        )}
      </div>

      {/* Retention Trend */}
      <div className={cardClass}>
        <p className="section-label">Retention</p>
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-2xl font-medium text-foreground">
              {retention != null ? `${retention}%` : '—'}
            </span>
            <TrendIndicator delta={retentionTrend} />
          </div>
          {sessionAcc.length > 0 && <Sparkline accuracies={sessionAcc} />}
        </div>
        <p className="text-[12px] text-foreground-muted text-center">
          Ease avg{' '}
          <span className="font-mono">{avgEase != null ? avgEase.toFixed(1) : '—'}</span>
          {' · '}
          <span className="font-mono">{totalCardCount}</span>
          {' cards total'}
        </p>
      </div>

      {/* Knowledge Coverage */}
      <div className={cardClass}>
        <p className="section-label">Knowledge Coverage</p>
        <div className="flex flex-col items-center gap-2">
          <RingCircle
            ratio={coverageRatio}
            colorVar="--primary"
            label={`Coverage ring: ${topicsCovered ?? '?'} of ${totalTopics ?? '?'} topics`}
          />
          <p className="font-mono text-2xl font-medium text-foreground leading-none">
            {topicsCovered != null && totalTopics != null
              ? `${topicsCovered}/${totalTopics}`
              : '—'}
          </p>
          <p className="text-[12px] text-foreground-muted">topics</p>
        </div>
        {(lastLabel || lastAgo) && (
          <p className="text-[11px] text-foreground-muted text-center mt-auto">
            Last: {lastLabel}{lastAgo && ` · ${lastAgo}`}
          </p>
        )}
      </div>
    </div>
  );
}
