'use client';

import { useState, useMemo, memo } from 'react';
import Link from 'next/link';
import { BookOpen, ChevronLeft, ChevronRight } from 'lucide-react';
import { EmptyState } from '@/components/patterns/EmptyState';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';

export interface StudySessionRecord {
  _id: string;
  activityType: string;
  studySetId?: string;
  durationSeconds: number;
  date: string;
  startedAt: string;
  cardsReviewed?: number;
  accuracy?: number;
}

interface StudySet {
  _id: string;
  name: string;
}

const PAGE_SIZE = 20;

function formatDuration(seconds: number): string {
  if (seconds < 60) return `0m ${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (seconds < 3600) return `${m}m ${String(s).padStart(2, '0')}s`;
  const h = Math.floor(seconds / 3600);
  const rm = Math.floor((seconds % 3600) / 60);
  return `${h}h ${String(rm).padStart(2, '0')}m`;
}

function formatDateCol(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function AccuracyCell({ accuracy }: { accuracy?: number }) {
  if (accuracy == null) return <span className="font-mono text-[12px] text-[hsl(var(--foreground-subtle))]">—</span>;
  const pct = Math.round(accuracy);
  const color =
    pct >= 80 ? 'text-[hsl(var(--success))]' :
    pct >= 60 ? 'text-[hsl(var(--warning))]' :
                'text-[hsl(var(--danger))]';
  return <span className={cn('font-mono text-[12px]', color)}>{pct}%</span>;
}

interface HistoryRowProps {
  session: StudySessionRecord;
  zebra: boolean;
  setName?: string;
}

const HistoryRow = memo(function HistoryRow({ session, zebra, setName }: HistoryRowProps) {
  return (
    <tr
      className={cn(
        'border-b border-border last:border-0',
        zebra ? 'bg-[hsl(var(--background))]' : 'bg-surface-2/50'
      )}
    >
      <td className="px-4 py-3 font-mono text-[12px] text-[hsl(var(--foreground-muted))]">
        {formatDateCol(session.date)}
      </td>
      <td className="px-4 py-3 text-[13px] text-foreground">
        {session.studySetId && setName ? (
          <Link
            href={`/sets/${session.studySetId}`}
            className="hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring rounded"
          >
            {setName}
          </Link>
        ) : (
          <span className="text-[hsl(var(--foreground-subtle))]">—</span>
        )}
      </td>
      <td className="px-4 py-3 font-mono text-[12px] text-[hsl(var(--foreground-muted))]">
        {formatDuration(session.durationSeconds)}
      </td>
      <td className="px-4 py-3 font-mono text-[12px] text-foreground">
        {session.cardsReviewed != null ? session.cardsReviewed : '—'}
      </td>
      <td className="px-4 py-3">
        <AccuracyCell accuracy={session.accuracy} />
      </td>
    </tr>
  );
});

interface Props {
  sessions: StudySessionRecord[];
  studySets: StudySet[];
}

export function StudyHistoryClient({ sessions, studySets }: Props) {
  const [filterSetId, setFilterSetId] = useState<string>('all');
  const [page, setPage]               = useState(1);

  const setNameById = useMemo(() =>
    studySets.reduce<Record<string, string>>((acc, s) => { acc[s._id] = s.name; return acc; }, {}),
    [studySets]
  );

  const filtered = useMemo(() => {
    if (filterSetId === 'all') return sessions;
    return sessions.filter(s => s.studySetId === filterSetId);
  }, [sessions, filterSetId]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function handleFilterChange(setId: string) {
    setFilterSetId(setId);
    setPage(1);
  }

  if (sessions.length === 0) {
    return (
      <EmptyState
        icon={<BookOpen className="h-6 w-6" aria-hidden="true" />}
        headline="No study sessions yet."
        subline="Start a flashcard review to begin tracking."
        action={
          <Button asChild>
            <Link href="/">Start reviewing</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Filter */}
      <div className="flex items-center justify-end">
        <select
          value={filterSetId}
          onChange={e => handleFilterChange(e.target.value)}
          className="rounded-md border border-border bg-surface-2 px-3 py-1.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          aria-label="Filter by study set"
        >
          <option value="all">All Sets</option>
          {studySets.map(s => (
            <option key={s._id} value={s._id}>{s.name}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={<BookOpen className="h-6 w-6" aria-hidden="true" />}
          headline="No sessions for this set."
          subline="Try selecting a different study set."
        />
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-border bg-surface-2">
                  <th className="px-4 py-2.5 text-left font-mono text-[11px] uppercase tracking-wide text-[hsl(var(--foreground-subtle))]">Date</th>
                  <th className="px-4 py-2.5 text-left font-mono text-[11px] uppercase tracking-wide text-[hsl(var(--foreground-subtle))]">Set</th>
                  <th className="px-4 py-2.5 text-left font-mono text-[11px] uppercase tracking-wide text-[hsl(var(--foreground-subtle))]">Duration</th>
                  <th className="px-4 py-2.5 text-left font-mono text-[11px] uppercase tracking-wide text-[hsl(var(--foreground-subtle))]">Cards</th>
                  <th className="px-4 py-2.5 text-left font-mono text-[11px] uppercase tracking-wide text-[hsl(var(--foreground-subtle))]">Accuracy</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((s, i) => (
                  <HistoryRow
                    key={s._id}
                    session={s}
                    zebra={i % 2 === 0}
                    setName={s.studySetId ? setNameById[s.studySetId] : undefined}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                aria-label="Previous page"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="font-mono text-[12px] text-[hsl(var(--foreground-muted))]">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                aria-label="Next page"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
