'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { BookOpen, AlertTriangle, AlertCircle, CheckCircle2, Zap, FileText, Brain, RefreshCw, Bug } from 'lucide-react';
import { type NowBrief, type NowBriefItem } from '@/lib/api/now-brief';
import { type StudySet, type Deadline } from '@/lib/api/study-sets';
import { type DueFeynmanSchedule } from '@/lib/api/feynman';
import { type Deadline as UpcomingDeadline } from '@/lib/api/deadlines';
import { Calendar as CalendarIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { cn } from '@/lib/cn';
import { ReadinessHeroCard } from './ReadinessHeroCard';
import { StudyHeatmap } from './StudyHeatmap';
import { useExamMode } from '@/contexts/ExamModeContext';

interface NowBriefViewProps {
  brief: NowBrief | null;
  studySets?: StudySet[];
  dueFeynmanReviews?: DueFeynmanSchedule[];
  streak?: number;
  upcomingExam?: Deadline & { setName: string };
  readinessScore?: number | null;
  studyActivityDays?: { date: string; minutesStudied: number }[];
  leechCount?: number;
  upcomingDeadlines?: UpcomingDeadline[];
}

function dayDiff(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + 'T00:00:00');
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

interface ReminderAlert {
  studySetId: string;
  studySetName: string;
  deadline: Deadline;
  daysUntil: number;
  isToday: boolean;
}

function computeReminders(studySets: StudySet[]): ReminderAlert[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().split('T')[0];
  const alerts: ReminderAlert[] = [];

  for (const set of studySets) {
    for (const d of (set.deadlines ?? [])) {
      if (d.passedAt || d.date < todayStr) continue;
      const daysUntil = dayDiff(d.date);
      for (const reminderDay of d.notifyDaysBefore) {
        const reminderDate = new Date(d.date + 'T00:00:00');
        reminderDate.setDate(reminderDate.getDate() - reminderDay);
        if (reminderDate.toISOString().split('T')[0] === todayStr) {
          alerts.push({ studySetId: set._id, studySetName: set.name, deadline: d, daysUntil, isToday: daysUntil === 0 });
        }
      }
      if (daysUntil === 0) {
        const alreadyAdded = alerts.some(a => a.studySetId === set._id && a.deadline.id === d.id);
        if (!alreadyAdded) {
          alerts.push({ studySetId: set._id, studySetName: set.name, deadline: d, daysUntil: 0, isToday: true });
        }
      }
    }
  }
  return alerts;
}

function prioritySortKey(item: NowBriefItem): number {
  if (item.overdueCount > 0) return 0;
  if (item.examMode) return 1;
  return 2;
}

function PriorityRow({ item, rank }: { item: NowBriefItem; rank: number }) {
  const isOverdue = item.overdueCount > 0;
  const isExam = item.examMode && !isOverdue;
  const estMin = Math.round((item.dueCount + item.overdueCount) * 1.5);

  return (
    <Link
      href={`/sets/${item.studySetId}/flashcards/review`}
      className={cn(
        'flex items-center h-9 px-2 gap-2 border-b border-border last:border-b-0',
        'hover:bg-surface transition-colors duration-[80ms] linear',
        isOverdue && 'border-l-2 border-l-[hsl(var(--danger))]',
        isExam   && 'border-l-2 border-l-[hsl(var(--warning))]',
      )}
    >
      <span className="font-mono text-[11px] text-foreground-subtle w-6 shrink-0 select-none">
        {String(rank).padStart(2, '0')}
      </span>

      {isExam
        ? <Zap size={16} className="shrink-0 text-foreground-muted" aria-hidden="true" />
        : <BookOpen size={16} className="shrink-0 text-foreground-muted" aria-hidden="true" />
      }

      <div className="flex-1 min-w-0">
        <span className="block text-[13px] font-medium text-foreground truncate">{item.studySetName}</span>
        <span className="block text-[11px] font-mono text-foreground-subtle leading-tight">
          <span>{item.dueCount}</span> due
          {item.overdueCount > 0 && <> · <span>{item.overdueCount}</span> overdue</>}
        </span>
      </div>

      {isExam ? (
        <span className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-mono bg-[hsl(var(--accent)/0.12)] text-[hsl(var(--accent))] whitespace-nowrap">
          Start ⌘R · ~{estMin} min
        </span>
      ) : (
        <span className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-mono bg-surface-2 text-foreground-muted">
          Start ⌘R
        </span>
      )}
    </Link>
  );
}

function SectionHeader({ label, count, variant = 'default' }: { label: string; count?: number; variant?: 'amber' | 'default' }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <h2 className={cn(
        'text-[10px] font-medium uppercase tracking-widest',
        variant === 'amber' ? 'text-amber' : 'text-foreground-subtle'
      )}>
        {label}
      </h2>
      {count !== undefined && (
        <span className={cn(
          'rounded-full px-2 py-0.5 text-xs font-medium',
          variant === 'amber' ? 'bg-amber/12 text-amber' : 'bg-surface-3 text-foreground-muted'
        )}>
          {count}
        </span>
      )}
    </div>
  );
}

function CaughtUpState() {
  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const dateStr = now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center select-none">
      <div className="relative mb-8 flex items-center justify-center">
        <div className="absolute h-32 w-32 rounded-full bg-success/5 animate-ping" style={{ animationDuration: '3s' }} aria-hidden="true" />
        <div className="absolute h-24 w-24 rounded-full bg-success/8" aria-hidden="true" />
        <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-success-soft ring-1 ring-success/20">
          <CheckCircle2 className="h-8 w-8 text-success" aria-hidden="true" />
        </div>
      </div>
      <h1 className="text-3xl font-sans font-medium text-foreground mb-2 tracking-tight">
        You&apos;re all caught up
      </h1>
      <p className="text-sm text-foreground-subtle mb-1">
        {dateStr} · {timeStr}
      </p>
      <p className="text-sm text-foreground-muted mb-10 max-w-sm">
        No cards are due today. Great work keeping up — come back tomorrow, or get ahead now.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full max-w-lg px-4">
        <Link
          href="/flashcards"
          className="group flex flex-col items-center gap-2 rounded-xl border border-border bg-background px-4 py-5 hover:border-primary/30 hover:bg-primary-soft transition-all duration-150"
        >
          <BookOpen className="h-5 w-5 text-foreground-muted group-hover:text-primary transition-colors" aria-hidden="true" />
          <span className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">Browse flashcards</span>
          <span className="text-xs text-foreground-subtle">Study ahead</span>
        </Link>
        <Link
          href="/pdfs"
          className="group flex flex-col items-center gap-2 rounded-xl border border-border bg-background px-4 py-5 hover:border-primary/30 hover:bg-primary-soft transition-all duration-150"
        >
          <FileText className="h-5 w-5 text-foreground-muted group-hover:text-primary transition-colors" aria-hidden="true" />
          <span className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">Open a PDF</span>
          <span className="text-xs text-foreground-subtle">Read &amp; annotate</span>
        </Link>
        <Link
          href="/flashcards"
          className="group flex flex-col items-center gap-2 rounded-xl border border-border bg-background px-4 py-5 hover:border-primary/30 hover:bg-primary-soft transition-all duration-150"
        >
          <Zap className="h-5 w-5 text-foreground-muted group-hover:text-primary transition-colors" aria-hidden="true" />
          <span className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">Free Feynman</span>
          <span className="text-xs text-foreground-subtle">Teach to learn</span>
        </Link>
      </div>
    </div>
  );
}

// Ghost rows shown to new users so they understand what the brief will look like
const GHOST_ITEMS = [
  { name: 'Organic Chemistry', due: 12, overdue: 3, exam: false },
  { name: 'Physics — Mechanics', due: 8, overdue: 0, exam: true },
  { name: 'Cell Biology', due: 5, overdue: 0, exam: false },
];

function NewUserState() {
  return (
    <div className="px-content-x py-8 max-w-2xl mx-auto select-none">
      {/* Intro banner */}
      <div className="mb-8 rounded-xl border border-border bg-surface-2 px-6 py-5 flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
          <Brain className="h-5 w-5 text-primary" aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground mb-0.5">Your Now Brief will look like this</p>
          <p className="text-xs text-foreground-muted">
            Create a study set, upload a PDF, and add flashcards — your daily priorities will appear here automatically.
          </p>
        </div>
        <Link
          href="/sets"
          className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Get started
        </Link>
      </div>

      {/* Ghost readiness hero */}
      <div className="mb-6 rounded-xl border border-border bg-surface-2 px-6 py-5 opacity-40 pointer-events-none" aria-hidden="true">
        <div className="flex items-center gap-4">
          <div className="h-14 w-14 rounded-full bg-surface-3" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-24 rounded bg-surface-3" />
            <div className="h-5 w-16 rounded bg-surface-3" />
          </div>
          <div className="h-8 w-28 rounded-full bg-surface-3" />
        </div>
      </div>

      {/* Ghost priority rows */}
      <div className="mb-2">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-[10px] font-medium uppercase tracking-widest text-foreground-subtle">Up next</span>
          <span className="rounded-full px-2 py-0.5 text-xs font-medium bg-surface-3 text-foreground-muted opacity-40">3</span>
        </div>
        <div className="rounded-lg border border-border overflow-hidden opacity-40 pointer-events-none" aria-hidden="true">
          {GHOST_ITEMS.map((item, i) => (
            <div key={i} className={cn(
              'flex items-center h-9 px-2 gap-2 border-b border-border last:border-b-0',
              item.overdue > 0 && 'border-l-2 border-l-[hsl(var(--danger))]',
              item.exam && !item.overdue && 'border-l-2 border-l-[hsl(var(--warning))]',
            )}>
              <span className="font-mono text-[11px] text-foreground-subtle w-6 shrink-0">{String(i + 1).padStart(2, '0')}</span>
              {item.exam
                ? <Zap size={16} className="shrink-0 text-foreground-muted" aria-hidden="true" />
                : <BookOpen size={16} className="shrink-0 text-foreground-muted" aria-hidden="true" />
              }
              <div className="flex-1 min-w-0">
                <span className="block text-[13px] font-medium text-foreground truncate">{item.name}</span>
                <span className="block text-[11px] font-mono text-foreground-subtle">
                  {item.due} due{item.overdue > 0 && ` · ${item.overdue} overdue`}
                </span>
              </div>
              <span className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-mono bg-surface-2 text-foreground-muted">
                Start ⌘R
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Ghost heatmap */}
      <div className="mt-6 rounded-xl border border-border bg-surface-2 h-20 opacity-30 pointer-events-none" aria-hidden="true" />
    </div>
  );
}

function ErrorState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center px-content-x">
      <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-danger-soft">
        <AlertTriangle className="h-7 w-7 text-danger" aria-hidden="true" />
      </div>
      <h2 className="text-h2 text-foreground mb-2">Couldn&apos;t load your brief</h2>
      <p className="text-sm text-foreground-muted mb-6">
        Check your connection and refresh.
      </p>
      <Button variant="outline" onClick={() => window.location.reload()}>
        Retry
      </Button>
    </div>
  );
}

export function NowBriefView({
  brief,
  studySets = [],
  dueFeynmanReviews = [],
  streak = 0,
  upcomingExam,
  readinessScore = null,
  studyActivityDays = [],
  leechCount = 0,
  upcomingDeadlines = [],
}: NowBriefViewProps) {
  const router = useRouter();
  const { examMode, examSetName, daysRemaining } = useExamMode();
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<string>>(new Set());
  const [reminders, setReminders] = useState<ReminderAlert[]>([]);

  useEffect(() => {
    setReminders(computeReminders(studySets));
  }, [studySets]);

  if (brief === null) return <ErrorState />;
  if (
    brief.items.length === 0
    && reminders.length === 0
    && dueFeynmanReviews.length === 0
    && !upcomingExam
    && upcomingDeadlines.length === 0
  ) {
    return studySets.length === 0 ? <NewUserState /> : <CaughtUpState />;
  }

  const handleRefresh = () => { router.refresh(); };

  const overdueTotal = brief.items.reduce((sum, i) => sum + i.overdueCount, 0);

  const sortedItems = [...brief.items].sort((a, b) => {
    // Boost the exam set from ExamModeContext above all else
    const aIsExam = examMode && a.studySetName === examSetName;
    const bIsExam = examMode && b.studySetName === examSetName;
    if (aIsExam && !bIsExam) return -1;
    if (bIsExam && !aIsExam) return 1;
    const ka = prioritySortKey(a);
    const kb = prioritySortKey(b);
    if (ka !== kb) return ka - kb;
    return b.priorityScore - a.priorityScore;
  });

  return (
    <div className="px-content-x max-w-3xl mx-auto pb-12">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-h1 text-foreground">Now Brief</h1>
        <Button variant="ghost" size="sm" onClick={handleRefresh} aria-label="Refresh Now Brief">
          <RefreshCw size={14} aria-hidden="true" className="mr-1.5" />
          Refresh
        </Button>
      </div>

      <ReadinessHeroCard
        score={readinessScore}
        dueCount={brief.totalDue}
        overdueCount={overdueTotal}
        items={brief.items}
        studySets={studySets}
        examMode={examMode}
        daysRemaining={daysRemaining}
        examSetName={examSetName}
      />

      <div className="flex items-center gap-3 flex-wrap mb-4">
        {streak > 0 && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-[var(--radius-md)] bg-[hsl(var(--accent)/0.1)] border border-[hsl(var(--accent)/0.2)]">
            <span className="h-2 w-2 rounded-full bg-[hsl(var(--accent))]" aria-hidden="true" />
            <span className="font-mono text-sm font-medium text-[hsl(var(--accent))]">{streak}-day</span>
            <span className="text-sm text-[hsl(var(--foreground-muted))]">streak</span>
          </div>
        )}
        {leechCount > 0 && (
          <Link
            href="/weakpoints?filter=leech"
            className="flex items-center gap-2 px-3 py-2 rounded-[var(--radius-md)] bg-[hsl(var(--danger-soft))] border border-[hsl(var(--danger)/0.3)] hover:bg-[hsl(var(--danger)/0.12)] transition-colors"
          >
            <Bug className="h-3.5 w-3.5 text-[hsl(var(--danger))]" aria-hidden="true" />
            <span className="font-mono text-sm font-medium text-[hsl(var(--danger))]">{leechCount}</span>
            <span className="text-sm text-[hsl(var(--danger))]">leech card{leechCount !== 1 ? 's' : ''}</span>
          </Link>
        )}
      </div>

      {upcomingExam && (() => {
        const daysLeft = Math.ceil((new Date(upcomingExam.date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        const isUrgent = daysLeft <= 7;
        return (
          <div className={cn(
            'flex items-center gap-3 p-3 rounded-[var(--radius-md)] border mb-6',
            isUrgent
              ? 'bg-[hsl(var(--warning)/0.08)] border-[hsl(var(--warning)/0.3)]'
              : 'bg-[hsl(var(--surface))] border-[hsl(var(--border))]'
          )}>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{upcomingExam.label}</p>
              <p className="text-xs text-[hsl(var(--foreground-muted))]">{upcomingExam.setName}</p>
            </div>
            <div className="text-right shrink-0">
              <span
                className="font-mono text-lg font-medium block"
                style={{ color: `hsl(var(${isUrgent ? '--warning' : '--foreground'}))` }}
              >
                {daysLeft}
              </span>
              <p className="text-xs text-[hsl(var(--foreground-muted))]">days</p>
            </div>
          </div>
        );
      })()}

      {reminders.length > 0 && (
        <div className="mb-6 flex flex-col gap-2" aria-label="Deadline reminders">
          {reminders.map(r => {
            const key = `${r.studySetId}-${r.deadline.id}`;
            if (!r.isToday && dismissedAlerts.has(key)) return null;
            return (
              <Alert
                key={key}
                variant="warning"
                dismissible={!r.isToday}
                onDismiss={() => setDismissedAlerts(prev => new Set([...prev, key]))}
              >
                <AlertCircle className="h-4 w-4 shrink-0 text-warning inline mr-2" aria-hidden="true" />
                <strong>{r.deadline.label}</strong> in <strong>{r.studySetName}</strong>{' '}
                {r.daysUntil === 0 ? 'is today.' : `in ${r.daysUntil} day${r.daysUntil !== 1 ? 's' : ''}.`}
                {' '}
                <Link href={`/sets/${r.studySetId}/flashcards/review`} className="text-primary underline">
                  Start Review
                </Link>
              </Alert>
            );
          })}
        </div>
      )}

      {sortedItems.length > 0 && (
        <section aria-label="Study priorities" className="mb-2">
          <div className="rounded-[var(--radius-md)] border border-border overflow-hidden">
            {sortedItems.map((item, idx) => (
              <PriorityRow key={item.studySetId} item={item} rank={idx + 1} />
            ))}
          </div>
          <div className="mt-2 flex flex-col gap-0.5">
            {sortedItems
              .filter(i => !i.nextDeadline)
              .map(i => (
                <p key={i.studySetId} className="ml-3 text-xs text-foreground-subtle">
                  <Link href={`/sets/${i.studySetId}?panel=deadlines`} className="text-primary hover:underline">
                    + Add deadline
                  </Link>
                  {' '}to <strong>{i.studySetName}</strong> to unlock Exam Mode.
                </p>
              ))
            }
          </div>
        </section>
      )}

      {upcomingDeadlines.length > 0 && (() => {
        const now = new Date();
        const startOfToday = new Date(now); startOfToday.setHours(0, 0, 0, 0);
        const endOfToday = new Date(now); endOfToday.setHours(23, 59, 59, 999);
        const endOfWeek = new Date(now); endOfWeek.setDate(endOfWeek.getDate() + 7);
        const isSnoozed = (d: UpcomingDeadline) =>
          d.snoozeUntil != null && new Date(d.snoozeUntil) > now;
        const active = upcomingDeadlines.filter(d => !d.passedAt && !isSnoozed(d));
        const todayItems = active.filter(d => {
          const dt = new Date(d.date);
          return dt >= startOfToday && dt <= endOfToday;
        });
        const weekItems = active.filter(d => {
          const dt = new Date(d.date);
          return dt > endOfToday && dt <= endOfWeek;
        });
        if (todayItems.length === 0 && weekItems.length === 0) return null;

        const setNameById = new Map<string, string>();
        for (const s of studySets) setNameById.set(s._id, s.name);

        const RowItem = ({ d }: { d: UpcomingDeadline }) => {
          const dt = new Date(d.date);
          const diff = Math.round((new Date(dt.toDateString()).getTime() - startOfToday.getTime()) / 86400000);
          const href = d.studySetId ? `/sets/${d.studySetId}` : '/deadlines';
          const tone = diff <= 0 ? '--danger' : diff <= 3 ? '--danger' : '--warning';
          return (
            <Link
              href={href}
              key={d.id}
              className={cn(
                'flex items-center gap-3 rounded-md border bg-background px-4 py-3 hover:bg-surface transition-colors',
              )}
            >
              <CalendarIcon size={14} className="shrink-0 text-foreground-muted" aria-hidden="true" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{d.label}</p>
                <p className="text-xs text-foreground-muted truncate">
                  {d.studySetId ? (setNameById.get(d.studySetId) ?? 'Study set') : 'Personal'}
                </p>
              </div>
              <span className="font-mono text-xs shrink-0" style={{ color: `hsl(var(${tone}))` }}>
                {diff === 0 ? 'Today' : diff === 1 ? 'Tomorrow' : `in ${diff}d`}
              </span>
            </Link>
          );
        };

        return (
          <section aria-label="Upcoming deadlines" className="mt-8 mb-2">
            <div className="border-t border-border mb-6" />
            <div className="flex items-center justify-between mb-3">
              <SectionHeader label="Deadlines" count={todayItems.length + weekItems.length} />
              <Link href="/deadlines" className="text-xs text-primary hover:underline">
                Manage →
              </Link>
            </div>
            {todayItems.length > 0 && (
              <>
                <p className="text-[11px] uppercase tracking-wider font-mono text-foreground-subtle mb-2">Today</p>
                <div className="flex flex-col gap-2 mb-3">
                  {todayItems.map(d => <RowItem key={d.id} d={d} />)}
                </div>
              </>
            )}
            {weekItems.length > 0 && (
              <>
                <p className="text-[11px] uppercase tracking-wider font-mono text-foreground-subtle mb-2">This week</p>
                <div className="flex flex-col gap-2">
                  {weekItems.map(d => <RowItem key={d.id} d={d} />)}
                </div>
              </>
            )}
          </section>
        );
      })()}

      <StudyHeatmap studyActivityDays={studyActivityDays} />

      {dueFeynmanReviews.length > 0 && (
        <section aria-label="Due Feynman reviews" className="mt-8">
          <div className="border-t border-border mb-6" />
          <SectionHeader label="Feynman reviews due" count={dueFeynmanReviews.length} />
          <div className="flex flex-col gap-2">
            {dueFeynmanReviews.map(schedule => (
              <div
                key={schedule._id}
                className="flex items-center gap-3 rounded-lg border border-border bg-background px-4 py-3"
              >
                <Brain size={16} className="text-primary shrink-0" aria-hidden="true" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{schedule.topic}</p>
                  <p className="text-xs text-foreground-muted">{schedule.studySetName}</p>
                </div>
                <Link
                  href={`/sets/${schedule.studySetId}/feynman?topic=${encodeURIComponent(schedule.topic)}`}
                  className="shrink-0 text-xs text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring rounded"
                >
                  Review →
                </Link>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
