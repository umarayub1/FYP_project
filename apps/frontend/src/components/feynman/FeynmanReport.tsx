'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { Check, AlertTriangle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { ScheduleDialog } from './ScheduleDialog';
import { getFeynmanSessions } from '@/lib/api/feynman';
import { type CoverageChunk, type FeynmanSession } from '@/lib/api/feynman';
import { useStagingContext } from '@/contexts/StagingContext';
import { cn } from '@/lib/cn';

const CIRC_80 = 2 * Math.PI * 34; // r=34 → ≈ 213.6

function statusToScore(status: 'covered' | 'partial' | 'missing'): number {
  if (status === 'covered') return 100;
  if (status === 'partial') return 45;
  return 0;
}

function getStatusMessage(clarity: number, accuracy: number): string {
  // Floor: if you didn't actually engage with the concepts, no amount of
  // readable prose buys "strong understanding". This catches fluent-but-
  // off-topic explanations that previously scored 80+ clarity for nonsense.
  if (accuracy < 20) {
    return "You haven't explained the concepts yet — try again with a real attempt.";
  }
  // 70/30 weighted combined score matches the cognitiveProfile.overallGrade
  // calculation on the server, so the prose and the letter grade agree.
  const combined = clarity * 0.3 + accuracy * 0.7;
  if (combined >= 80) return 'Strong understanding of this topic.';
  if (combined >= 60) return 'Covered most of the topic but missed key edge cases.';
  if (combined >= 40) return 'Partial coverage — focus on the gaps below.';
  return 'This topic needs significant work.';
}

function ClarityRing80({ clarity }: { clarity: number }) {
  const color =
    clarity > 70  ? 'hsl(var(--success))'
    : clarity >= 40 ? 'hsl(var(--warning))'
    : 'hsl(var(--danger))';

  return (
    <svg
      width="80"
      height="80"
      viewBox="0 0 80 80"
      aria-label={`Clarity score: ${clarity}%`}
      role="img"
      className="shrink-0"
    >
      <circle cx="40" cy="40" r="34" fill="none" stroke="hsl(var(--border))" strokeWidth="5" />
      <circle
        cx="40" cy="40" r="34"
        fill="none"
        stroke={color}
        strokeWidth="5"
        strokeDasharray={String(CIRC_80)}
        strokeDashoffset={CIRC_80 * (1 - clarity / 100)}
        strokeLinecap="round"
        transform="rotate(-90 40 40)"
        style={{ transition: 'stroke-dashoffset 400ms ease-out' }}
      />
      <text x="40" y="37" textAnchor="middle" dominantBaseline="central" fontSize="20" fontWeight="500" fontFamily="monospace" fill="hsl(var(--foreground))">{clarity}</text>
      <text x="40" y="53" textAnchor="middle" dominantBaseline="central" fontSize="8" fontFamily="sans-serif" fill="hsl(var(--foreground-subtle))" letterSpacing="0.08em">CLARITY</text>
    </svg>
  );
}

export interface FeynmanReportProps {
  session:       FeynmanSession;
  clarityScore:  number; // 0–100
  accuracyScore?: number; // 0–100; falls back to session row if not given
  coverage:      CoverageChunk[];
  setId:         string;
  elapsedSec:    number;
}

export function FeynmanReport({ session, clarityScore, accuracyScore, coverage, setId, elapsedSec }: FeynmanReportProps) {
  const router = useRouter();
  const staging = useStagingContext();
  const [scheduleOpen, setScheduleOpen]         = useState(false);
  const [scheduledDate, setScheduledDate]       = useState<string | null>(null);
  const [scheduleDismissed, setScheduleDismissed] = useState(false);
  const [stagedItems, setStagedItems]           = useState<Set<string>>(new Set());
  const [allGapsDone, setAllGapsDone]           = useState(false);
  const [history, setHistory]                   = useState<FeynmanSession[]>([]);

  const durationMin = Math.max(1, Math.round(elapsedSec / 60));
  const sessionDate = format(new Date(session.createdAt), 'MMM d');
  // Prefer the freshly-evaluated accuracy passed from the session screen
  // (end-of-session has the live score); fall back to the session row's
  // persisted value when this component renders on resume of a complete
  // session that already has scores saved.
  const effectiveAccuracy = accuracyScore ?? session.accuracyScore ?? 0;
  const statusMsg = getStatusMessage(clarityScore, effectiveAccuracy);

  const sorted = [
    ...coverage.filter(c => c.status === 'covered'),
    ...coverage.filter(c => c.status === 'partial'),
    ...coverage.filter(c => c.status === 'missing'),
  ];

  const gapConcepts = coverage.filter(c => c.status !== 'covered');

  useEffect(() => {
    getFeynmanSessions(setId)
      .then(sessions => {
        const topicHistory = sessions
          .filter(s => s.topic === session.topic && s.status === 'complete')
          .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        setHistory(topicHistory);
      })
      .catch(() => {});
  }, [setId, session.topic]);

  function stageItem(chunk: CoverageChunk, type: 'cornell' | 'cards') {
    staging.stage(type === 'cards' ? 'card' : 'cornell-row', {
      text:        chunk.label,
      studySetId:  setId,
      sourceTitle: `Feynman: ${session.topic}`,
    });
    setStagedItems(prev => new Set([...prev, chunk.id]));
    toast.success(`Staged to ${type === 'cornell' ? 'Cornell notes' : 'flashcards'}`);
  }

  function stageAllGaps(type: 'cornell' | 'cards') {
    const kind = type === 'cards' ? 'card' : 'cornell-row';
    for (const chunk of gapConcepts) {
      staging.stage(kind, {
        text:        chunk.label,
        studySetId:  setId,
        sourceTitle: `Feynman: ${session.topic}`,
      });
    }
    setStagedItems(new Set(gapConcepts.map(c => c.id)));
    setAllGapsDone(true);
    toast.success(`All gaps staged to ${type === 'cornell' ? 'Cornell notes' : 'flashcards'}`);
  }

  // Session history sparkline (scores are stored 0..100 in Mongo).
  const maxScore = Math.max(...history.map(s => Math.round(s.clarityScore ?? 0)), 100);
  const trend = history.length >= 2
    ? Math.round(history[history.length - 1].clarityScore ?? 0)
      - Math.round(history[0].clarityScore ?? 0)
    : null;

  return (
    <div className="flex flex-col items-center py-12 px-6 overflow-y-auto h-full">
      <div className="w-full max-w-[560px]">
        {/* Header */}
        <h2 className="text-h1 text-foreground mb-1">Feynman Session Complete</h2>
        <p className="text-sm text-foreground-muted mb-6 font-mono">
          {session.topic} · {sessionDate} · {durationMin} min
        </p>

        <div className="border-t border-border mb-6" />

        {/* Clarity Ring + Status */}
        <div className="flex items-center gap-6 mb-6">
          <ClarityRing80 clarity={clarityScore} />
          <div>
            <p className="text-sm font-medium text-foreground mb-1">
              Clarity: <span className="font-mono">{clarityScore}%</span>
            </p>
            <p className="text-sm text-foreground-muted italic">"{statusMsg}"</p>
          </div>
        </div>

        <div className="border-t border-border mb-6" />

        {/* Concept breakdown */}
        {sorted.length > 0 && (
          <>
            <h3 className="text-[11px] font-medium uppercase tracking-wider text-foreground-subtle mb-3">
              Concept Breakdown
            </h3>
            <div className="flex flex-col gap-0.5 mb-6">
              {sorted.map(chunk => {
                const score = statusToScore(chunk.status);
                const Icon = chunk.status === 'covered' ? Check
                           : chunk.status === 'partial'  ? AlertTriangle
                           : X;
                const iconColor = chunk.status === 'covered' ? 'text-success'
                                : chunk.status === 'partial'  ? 'text-warning'
                                : 'text-danger';
                const action = score >= 70 ? 'Stage to Cornell' : 'Stage to Cards';
                const staged = stagedItems.has(chunk.id);

                return (
                  <div key={chunk.id} className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-surface-2">
                    <Icon className={cn('h-3.5 w-3.5 shrink-0', iconColor)} aria-hidden="true" />
                    <span className="flex-1 text-[13px] text-foreground">{chunk.label}</span>
                    <span className="font-mono text-[12px] w-10 text-right text-foreground-muted">{score}%</span>
                    {staged ? (
                      <span className="text-[11px] text-success w-28 text-right">Staged ✓</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => stageItem(chunk, score >= 70 ? 'cornell' : 'cards')}
                        className="text-[11px] text-primary hover:text-primary/80 w-28 text-right cursor-pointer"
                      >
                        {action}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        <div className="border-t border-border mb-6" />

        {/* Session history */}
        {history.length > 0 && (
          <>
            <h3 className="text-[11px] font-medium uppercase tracking-wider text-foreground-subtle mb-3">
              Session History
            </h3>
            <div className="flex flex-col gap-2 mb-3">
              {history.map((s, i) => {
                const score = Math.round(s.clarityScore ?? 0);
                const barPx = Math.round((score / maxScore) * 140);
                return (
                  <div key={s._id} className="flex items-center gap-3">
                    <span className="font-mono text-[11px] text-foreground-muted shrink-0 w-32">
                      Session <span className="font-mono">{i + 1}</span> ({format(new Date(s.createdAt), 'MMM d')}):
                    </span>
                    <span className="font-mono text-[11px] text-foreground-muted w-8 text-right shrink-0">{score}%</span>
                    <div className="flex items-center gap-0.5">
                      <div className="h-1.5 rounded-l bg-primary/30" style={{ width: barPx }} />
                      <div className="h-2.5 w-2.5 rounded-full bg-primary shrink-0" />
                    </div>
                  </div>
                );
              })}
            </div>
            {trend !== null && (
              <p className="text-[12px] text-foreground-muted mb-6">
                Trend:{' '}
                <span className={cn('font-mono font-medium', trend >= 0 ? 'text-success' : 'text-danger')}>
                  {trend >= 0 ? '+' : ''}{trend}%
                </span>
                {' '}across{' '}
                <span className="font-mono">{history.length}</span> sessions
              </p>
            )}
          </>
        )}

        {history.length > 0 && <div className="border-t border-border mb-6" />}

        {/* Stage all gaps */}
        {gapConcepts.length > 0 && (
          <div className="flex flex-wrap gap-3 mb-6">
            <Button
              variant="outline"
              size="sm"
              onClick={() => stageAllGaps('cards')}
              disabled={allGapsDone}
            >
              Stage all gaps to Flashcards
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => stageAllGaps('cornell')}
              disabled={allGapsDone}
            >
              Stage all gaps to Cornell
            </Button>
          </div>
        )}

        {/* Schedule prompt */}
        {!scheduledDate && !scheduleDismissed && (
          <div className="rounded-xl border border-border bg-surface px-5 py-4 mb-6">
            <p className="text-sm text-foreground-muted mb-3 italic">
              "Re-explain this topic in 3 days?"
            </p>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => setScheduleOpen(true)}>
                Schedule re-explanation
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setScheduleDismissed(true)}>
                No thanks
              </Button>
            </div>
          </div>
        )}
        {scheduledDate && (
          <p className="text-sm text-success mb-6">
            Next review: <span className="font-mono">{format(new Date(scheduledDate), 'MMM d')}</span>
          </p>
        )}

        {/* Done */}
        <div className="flex justify-center pt-2">
          <Button onClick={() => router.push(`/sets/${setId}/feynman`)}>
            Done
          </Button>
        </div>
      </div>

      <ScheduleDialog
        sessionId={session._id}
        open={scheduleOpen}
        onOpenChange={setScheduleOpen}
        onScheduled={setScheduledDate}
      />
    </div>
  );
}
