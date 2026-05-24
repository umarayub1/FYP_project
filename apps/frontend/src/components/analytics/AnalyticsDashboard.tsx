'use client';
import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { gatewayGet } from '@/lib/api/gateway';
import { BarChart2 } from 'lucide-react';
import { EmptyState } from '@/components/patterns/EmptyState';
import { Skeleton } from '@/components/ui/skeleton';

const RetentionChartLazy = dynamic(
  () => import('./RetentionChart').then(m => ({ default: m.RetentionChart })),
  { ssr: false, loading: () => <Skeleton className="h-[160px] w-full" /> },
);

// ── Types ────────────────────────────────────────────────────────────────────

interface ReviewHistoryEntry {
  date: string;
  retentionRate: number;
  cardsReviewed: number;
}

interface AnalyticsData {
  totalCards: number;
  dueCards: number;
  readinessScore: number;
  avgEaseFactor: number;
  reviewSessionsThisWeek: number;
  avgSessionDurationMin: number;
  reviewHistory?: ReviewHistoryEntry[];
}

interface FeynmanSessionItem {
  _id: string;
  topic: string;
  clarityScore?: number;
  createdAt: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildRetentionData(reviewHistory: ReviewHistoryEntry[]) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dataMap = new Map(reviewHistory.map(r => [r.date, r]));

  return Array.from({ length: 30 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - 29 + i);
    const dateStr = d.toISOString().slice(0, 10);
    const entry = dataMap.get(dateStr);
    return {
      date: dateStr,
      label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      retentionRate: entry?.retentionRate ?? 0,
      cardsReviewed: entry?.cardsReviewed ?? 0,
    };
  });
}

interface HeatmapCell {
  date: string;
  count: number;
  isFuture: boolean;
}

function buildHeatmapGrid(reviewHistory: ReviewHistoryEntry[]): HeatmapCell[][] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dataMap = new Map(reviewHistory.map(r => [r.date, r.cardsReviewed]));

  // Sunday of current week
  const thisWeekSunday = new Date(today);
  thisWeekSunday.setDate(today.getDate() - today.getDay());

  // Grid starts 12 weeks before this week's Sunday (col 0 = 12 weeks ago)
  const gridStart = new Date(thisWeekSunday);
  gridStart.setDate(thisWeekSunday.getDate() - 12 * 7);

  // 7 rows (Sun–Sat) × 13 cols (weeks)
  return Array.from({ length: 7 }, (_, row) =>
    Array.from({ length: 13 }, (_, col) => {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + col * 7 + row);
      const dateStr = d.toISOString().slice(0, 10);
      return {
        date: dateStr,
        count: dataMap.get(dateStr) ?? 0,
        isFuture: d > today,
      };
    })
  );
}

function heatmapCellClass(count: number, isFuture: boolean): string {
  if (isFuture) return 'bg-[hsl(var(--surface-2))]';
  if (count === 0) return 'bg-[hsl(var(--surface-2))]';
  if (count < 5) return 'bg-[hsl(var(--primary)/0.25)]';
  if (count < 10) return 'bg-[hsl(var(--primary)/0.55)]';
  return 'bg-[hsl(var(--primary))]';
}

function formatHeatmapTooltip(date: string, count: number): string {
  const d = new Date(date + 'T00:00:00');
  const label = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  return count === 0 ? `${label} — no reviews` : `${label} — ${count} card${count === 1 ? '' : 's'} reviewed`;
}

function clarityColor(pct: number): string {
  if (pct < 30) return 'text-[hsl(var(--danger))]';
  if (pct <= 60) return 'text-[hsl(var(--warning))]';
  return 'text-[hsl(var(--success))]';
}

// ── Main component ───────────────────────────────────────────────────────────

export function AnalyticsDashboard({ setId }: { setId: string }) {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [feynmanSessions, setFeynmanSessions] = useState<FeynmanSessionItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      gatewayGet<AnalyticsData>(`/study-sets/${setId}/analytics`),
      gatewayGet<FeynmanSessionItem[]>(`/study-sets/${setId}/feynman/sessions`).catch(() => []),
    ])
      .then(([analytics, sessions]) => {
        setData(analytics);
        setFeynmanSessions(sessions);
      })
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [setId]);

  if (loading) return <AnalyticsSkeleton />;
  if (!data) return <EmptyAnalytics />;

  const reviewHistory = data.reviewHistory ?? [];
  const retentionData = buildRetentionData(reviewHistory);
  const heatmapGrid = buildHeatmapGrid(reviewHistory);

  return (
    <div className="space-y-8 mt-4">
      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-[var(--space-card-y)]">
        <ReadinessRing score={data.readinessScore} />
        <StatCard label="Total cards" value={data.totalCards} unit="cards" />
        <StatCard label="Due now" value={data.dueCards} unit="cards" highlight={data.dueCards > 0} />
        <StatCard label="Avg ease" value={data.avgEaseFactor} unit="" decimals={2} />
        <StatCard label="Reviews this week" value={data.reviewSessionsThisWeek} unit="sessions" />
        <StatCard label="Avg session" value={data.avgSessionDurationMin} unit="min" decimals={1} />
      </div>

      {/* Retention chart */}
      <RetentionChart data={retentionData} />

      {/* Feynman coverage */}
      <FeynmanCoverage sessions={feynmanSessions} setId={setId} />

      {/* 90-day heatmap */}
      <ReviewHeatmap grid={heatmapGrid} />
    </div>
  );
}

// ── Retention Chart ──────────────────────────────────────────────────────────

function RetentionChart({ data }: { data: ReturnType<typeof buildRetentionData> }) {
  return (
    <section className="p-4 rounded-[var(--radius-lg)] bg-[hsl(var(--surface))] border border-[hsl(var(--border))]">
      <h2 className="text-xs font-mono uppercase tracking-wider text-[hsl(var(--foreground-muted))] mb-4">
        Retention (last 30 days)
      </h2>
      <RetentionChartLazy data={data} />
    </section>
  );
}

// ── Feynman Coverage ─────────────────────────────────────────────────────────

function FeynmanCoverage({
  sessions,
  setId,
}: {
  sessions: FeynmanSessionItem[];
  setId: string;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);

  // Group by topic, take most recent session's clarityScore
  const topicMap = new Map<string, number>();
  for (const s of sessions) {
    if (!topicMap.has(s.topic)) {
      topicMap.set(s.topic, Math.round((s.clarityScore ?? 0)));
    }
  }

  const topics = Array.from(topicMap.entries())
    .map(([topic, pct]) => ({ topic, pct }))
    .sort((a, b) => b.pct - a.pct);

  const MAX_VISIBLE = 10;
  const visible = expanded ? topics : topics.slice(0, MAX_VISIBLE);
  const hidden = topics.length - MAX_VISIBLE;

  if (topics.length === 0) return null;

  return (
    <section className="p-4 rounded-[var(--radius-lg)] bg-[hsl(var(--surface))] border border-[hsl(var(--border))]">
      <h2 className="text-xs font-mono uppercase tracking-wider text-[hsl(var(--foreground-muted))] mb-4">
        Feynman Coverage by Topic
      </h2>
      <div className="space-y-3">
        {visible.map(({ topic, pct }) => (
          <div key={topic} className="flex items-center gap-3">
            <span
              className="text-[13px] text-[hsl(var(--foreground))] truncate shrink-0"
              style={{ minWidth: 140, maxWidth: 140 }}
              title={topic}
            >
              {topic}
            </span>
            <div className="flex-1 h-1 rounded-full bg-[hsl(var(--surface-2))] overflow-hidden">
              <div
                className="h-full rounded-full bg-[hsl(var(--primary))]"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className={`font-mono text-xs w-9 text-right shrink-0 ${clarityColor(pct)}`}>
              {pct}%
            </span>
            <button
              onClick={() => router.push(`/sets/${setId}/feynman?topic=${encodeURIComponent(topic)}`)}
              className="shrink-0 text-[hsl(var(--foreground-muted))] hover:text-[hsl(var(--primary))] transition-colors text-sm leading-none"
              aria-label={`Retry Feynman for ${topic}`}
              title="Retry Feynman session"
            >
              ↻
            </button>
          </div>
        ))}
      </div>
      {!expanded && hidden > 0 && (
        <button
          onClick={() => setExpanded(true)}
          className="mt-3 text-xs text-[hsl(var(--primary))] hover:underline font-mono"
        >
          Show {hidden} more
        </button>
      )}
    </section>
  );
}

// ── Review Heatmap ───────────────────────────────────────────────────────────

const ROW_LABELS: Record<number, string> = { 1: 'Mon', 3: 'Wed', 5: 'Fri' };

function ReviewHeatmap({ grid }: { grid: HeatmapCell[][] }) {
  return (
    <TooltipProvider>
      <section className="p-4 rounded-[var(--radius-lg)] bg-[hsl(var(--surface))] border border-[hsl(var(--border))]">
        <h2 className="text-xs font-mono uppercase tracking-wider text-[hsl(var(--foreground-muted))] mb-4">
          Review Activity <span className="normal-case">(last 90 days)</span>
        </h2>
        <div className="flex gap-2">
          {/* Row labels column */}
          <div
            className="flex flex-col shrink-0"
            style={{ gap: 2, paddingTop: 0 }}
          >
            {Array.from({ length: 7 }, (_, row) => (
              <div
                key={row}
                className="font-mono text-[10px] text-[hsl(var(--foreground-muted))] flex items-center justify-end pr-1"
                style={{ height: 10, width: 24 }}
              >
                {ROW_LABELS[row] ?? ''}
              </div>
            ))}
          </div>

          {/* Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateRows: 'repeat(7, 10px)',
              gridTemplateColumns: 'repeat(13, 10px)',
              gap: 2,
            }}
          >
            {grid.flatMap((row, rowIdx) =>
              row.map((cell, colIdx) => (
                <Tooltip key={`${rowIdx}-${colIdx}`}>
                  <TooltipTrigger asChild>
                    <div
                      className={`rounded-[2px] cursor-default ${heatmapCellClass(cell.count, cell.isFuture)}`}
                      style={{ width: 10, height: 10, gridRow: rowIdx + 1, gridColumn: colIdx + 1 }}
                    />
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    {formatHeatmapTooltip(cell.date, cell.isFuture ? 0 : cell.count)}
                  </TooltipContent>
                </Tooltip>
              ))
            )}
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-1.5 mt-3">
          <span className="font-mono text-[10px] text-[hsl(var(--foreground-muted))]">Less</span>
          {['bg-[hsl(var(--surface-2))]', 'bg-[hsl(var(--primary)/0.25)]', 'bg-[hsl(var(--primary)/0.55)]', 'bg-[hsl(var(--primary))]'].map((cls, i) => (
            <div key={i} className={`rounded-[2px] ${cls}`} style={{ width: 10, height: 10 }} />
          ))}
          <span className="font-mono text-[10px] text-[hsl(var(--foreground-muted))]">More</span>
        </div>
      </section>
    </TooltipProvider>
  );
}

// ── Existing sub-components ──────────────────────────────────────────────────

function ReadinessRing({ score }: { score: number }) {
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (score / 100) * circumference;
  const colorVar = score >= 80 ? '--success' : score >= 50 ? '--warning' : '--danger';

  return (
    <div className="flex flex-col items-center gap-2 p-4 rounded-[var(--radius-lg)] bg-[hsl(var(--surface))] border border-[hsl(var(--border))] col-span-full md:col-span-1">
      <svg width="100" height="100" viewBox="0 0 100 100" aria-label={`Readiness score: ${score}`}>
        <circle cx="50" cy="50" r={radius} fill="none" stroke="hsl(var(--surface-2))" strokeWidth="8" />
        <circle
          cx="50" cy="50" r={radius}
          fill="none"
          style={{ stroke: `hsl(var(${colorVar}))` }}
          strokeWidth="8"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          transform="rotate(-90 50 50)"
        />
        <text
          x="50" y="54"
          textAnchor="middle"
          style={{ fontFamily: 'var(--font-mono)', fontSize: '18px', fill: `hsl(var(${colorVar}))`, fontWeight: 500 }}
        >
          {score}
        </text>
      </svg>
      <p className="text-xs text-[hsl(var(--foreground-muted))]">Readiness</p>
    </div>
  );
}

function StatCard({
  label,
  value,
  unit,
  decimals = 0,
  highlight = false,
}: {
  label: string;
  value: number;
  unit: string;
  decimals?: number;
  highlight?: boolean;
}) {
  return (
    <div
      className={`p-4 rounded-[var(--radius-lg)] border ${
        highlight
          ? 'border-[hsl(var(--warning)/0.4)] bg-[hsl(var(--warning-soft))]'
          : 'border-[hsl(var(--border))] bg-[hsl(var(--surface))]'
      }`}
    >
      <p className="text-xs text-[hsl(var(--foreground-muted))] mb-1">{label}</p>
      <p className="font-mono text-2xl font-medium">
        {decimals > 0 ? value.toFixed(decimals) : value}
        {unit && (
          <span className="text-sm font-normal ml-1 text-[hsl(var(--foreground-muted))]">
            {unit}
          </span>
        )}
      </p>
    </div>
  );
}

function AnalyticsSkeleton() {
  return (
    <div className="space-y-8 mt-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-[var(--space-card-y)]">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className={`p-4 rounded-[var(--radius-lg)] border border-[hsl(var(--border))] bg-[hsl(var(--surface))] animate-pulse ${
              i === 0 ? 'col-span-full md:col-span-1' : ''
            }`}
            style={{ height: i === 0 ? 160 : 88 }}
          />
        ))}
      </div>
      {[160, 200, 140].map((h, i) => (
        <div
          key={i}
          className="rounded-[var(--radius-lg)] border border-[hsl(var(--border))] bg-[hsl(var(--surface))] animate-pulse"
          style={{ height: h }}
        />
      ))}
    </div>
  );
}

function EmptyAnalytics() {
  return (
    <EmptyState
      icon={<BarChart2 className="h-6 w-6" aria-hidden="true" />}
      headline="No study data yet."
      subline="Stats appear after your first session."
    />
  );
}
