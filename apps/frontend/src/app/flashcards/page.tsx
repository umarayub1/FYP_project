import { AppShell } from '@/components/shell/AppShell';
import { getStudySets } from '@/lib/api/study-sets';
import { getNowBrief } from '@/lib/api/now-brief';
import { BookOpen, Play, ArrowRight, Zap } from 'lucide-react';
import Link from 'next/link';
import { StartReviewingButton } from '@/components/flashcards/StartReviewingButton';
import type { ReviewableSet } from '@/components/flashcards/ReviewStartDialog';

export const metadata = { title: 'Flashcards — Synapse' };

export default async function FlashcardsPage() {
  const [sets, brief] = await Promise.all([
    getStudySets({ includeArchived: true }).catch(() => []),
    getNowBrief().catch(() => null),
  ]);

  const dueMap      = new Map(brief?.items.map(i => [i.studySetId, i.dueCount])      ?? []);
  const overdueMap  = new Map(brief?.items.map(i => [i.studySetId, i.overdueCount])  ?? []);
  const examModeMap = new Map(brief?.items.map(i => [i.studySetId, i.examMode])       ?? []);

  const totalDue     = brief?.totalDue ?? 0;
  const setsWithDue  = sets.filter(s => (dueMap.get(s._id) ?? 0) > 0).length;
  const totalOverdue = brief?.items.reduce((sum, i) => sum + i.overdueCount, 0) ?? 0;

  return (
    <AppShell breadcrumb={['Flashcards']} studySets={sets}>
      {/* Stats strip */}
      <div className="border-b border-border bg-surface-2 -mx-0 px-content-x">
        <div className="max-w-3xl mx-auto flex items-stretch divide-x divide-border">
          <div className="flex flex-col py-4 pr-8">
            <span className={`text-3xl font-mono leading-none tabular-nums ${totalDue > 0 ? 'text-primary' : 'text-foreground-muted'}`}>
              {totalDue}
            </span>
            <span className="text-[10px] font-medium uppercase tracking-widest text-foreground-subtle mt-1">
              due today
            </span>
          </div>
          <div className="flex flex-col py-4 px-8">
            <span className="text-3xl font-mono leading-none tabular-nums text-foreground">
              {sets.length}
            </span>
            <span className="text-[10px] font-medium uppercase tracking-widest text-foreground-subtle mt-1">
              study sets
            </span>
          </div>
          <div className="flex flex-col py-4 px-8">
            <span className={`text-3xl font-mono leading-none tabular-nums ${totalOverdue > 0 ? 'text-danger' : 'text-foreground-muted'}`}>
              {totalOverdue}
            </span>
            <span className="text-[10px] font-medium uppercase tracking-widest text-foreground-subtle mt-1">
              overdue
            </span>
          </div>
          {totalDue > 0 && (
            <div className="hidden sm:flex items-center justify-end flex-1 py-4 pl-6">
              <StartReviewingButton
                totalDue={totalDue}
                sets={sets.map<ReviewableSet>(s => ({
                  _id:     s._id,
                  name:    s.name,
                  color:   s.color,
                  due:     dueMap.get(s._id)     ?? 0,
                  overdue: overdueMap.get(s._id) ?? 0,
                }))}
              />
            </div>
          )}
        </div>
      </div>

      <div className="px-content-x py-8 max-w-3xl mx-auto">
        <div className="flex items-baseline justify-between mb-6">
          <h1 className="text-h1 text-foreground">Flashcards</h1>
          {setsWithDue > 0 && (
            <span className="text-xs text-foreground-subtle">
              {setsWithDue} set{setsWithDue !== 1 ? 's' : ''} need review
            </span>
          )}
        </div>

        {sets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-surface-2 border border-border">
              <BookOpen className="h-7 w-7 text-foreground-subtle" aria-hidden="true" />
            </div>
            <h2 className="text-h2 text-foreground mb-2">No cards across all sets.</h2>
            <p className="text-sm text-foreground-muted max-w-xs mb-8">
              Create a study set, upload a PDF, and let Synapse generate flashcards for you.
            </p>
            <Link
              href="/now-brief"
              className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-fg hover:bg-primary-hover transition-colors"
            >
              Go to Now Brief
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {sets.map(set => {
              const due      = dueMap.get(set._id)      ?? 0;
              const overdue  = overdueMap.get(set._id)  ?? 0;
              const examMode = examModeMap.get(set._id) ?? false;

              return (
                <div
                  key={set._id}
                  className="group relative flex overflow-hidden rounded-lg border border-border bg-background hover:shadow-md transition-shadow duration-150"
                >
                  {/* Color accent bar */}
                  <div
                    className="w-1 shrink-0 self-stretch"
                    style={{ backgroundColor: set.color }}
                    aria-hidden="true"
                  />

                  <div className="flex-1 min-w-0 flex flex-col">
                    {/* Exam mode banner */}
                    {examMode && (
                      <div className="flex items-center gap-2 px-4 py-1.5 bg-amber/8 border-b border-amber/20">
                        <Zap className="h-3 w-3 text-amber shrink-0" aria-hidden="true" />
                        <span className="text-[10px] font-medium uppercase tracking-widest text-amber">Exam Mode</span>
                      </div>
                    )}

                    <div className="flex items-center gap-4 px-4 py-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{set.name}</p>
                        <div className="flex flex-wrap items-center gap-2 mt-1.5">
                          {due > 0 ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                              <BookOpen className="h-3 w-3" aria-hidden="true" />
                              {due} due
                            </span>
                          ) : (
                            <span className="text-xs text-foreground-subtle">All caught up</span>
                          )}
                          {overdue > 0 && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-danger-soft px-2 py-0.5 text-xs font-medium text-danger">
                              {overdue} overdue
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <Link
                          href={`/sets/${set._id}/flashcards`}
                          className="rounded-md px-3 py-1.5 text-xs font-medium text-foreground-muted hover:text-foreground border border-border hover:bg-surface-2 transition-colors"
                        >
                          Browse
                        </Link>
                        {due > 0 ? (
                          <Link
                            href={`/sets/${set._id}/flashcards/review`}
                            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium bg-primary text-primary-fg hover:bg-primary-hover transition-colors"
                          >
                            <Play className="h-3 w-3" aria-hidden="true" />
                            Review
                          </Link>
                        ) : (
                          <Link
                            href={`/sets/${set._id}/flashcards/review?cram=true`}
                            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-foreground-muted hover:text-foreground border border-border hover:bg-surface-2 transition-colors"
                            title="Drill the deck without affecting your SM-2 schedule"
                          >
                            <Zap className="h-3 w-3" aria-hidden="true" />
                            Cram
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
