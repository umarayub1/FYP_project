'use client';

import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Info } from 'lucide-react';
import { ClarityRing } from './ClarityRing';
import { type CoverageChunk, type FeynmanGradingSource } from '@/lib/api/feynman';
import { cn } from '@/lib/cn';

interface CoverageMapProps {
  chunks:          CoverageChunk[];
  clarityScore:    number; // 0–100
  topic:           string;
  skepticQ:        string | null;
  onAnswerSkeptic: () => void;
  /** When 'generic', show a "no source attached" label so the user knows
   *  they're being graded against the LLM's general knowledge of the topic,
   *  not their uploaded material. */
  source?:         FeynmanGradingSource;
}

function statusToPct(status: CoverageChunk['status']): number {
  if (status === 'covered') return 100;
  if (status === 'partial')  return 45;
  return 0;
}

function ConceptRow({
  chunk,
  expanded,
}: {
  chunk:    CoverageChunk;
  expanded: boolean;
}) {
  const pct = statusToPct(chunk.status);
  const Icon =
    pct >= 70 ? CheckCircle2
    : pct >= 20 ? AlertTriangle
    : XCircle;
  const iconColor =
    pct >= 70 ? 'text-success'
    : pct >= 20 ? 'text-warning'
    : 'text-danger';
  const barColor =
    pct >= 70 ? 'bg-success'
    : pct >= 20 ? 'bg-warning'
    : 'bg-danger';

  return (
    <div
      className="rounded-sm hover:bg-surface transition-colors"
      role="listitem"
      aria-label={`${chunk.label}: ${pct}%`}
    >
      <div className="flex items-center gap-2 px-3" style={{ height: 36 }}>
        <Icon
          className={cn('h-3.5 w-3.5 shrink-0', iconColor)}
          aria-hidden="true"
        />
        <span className="flex-1 min-w-0 truncate text-[12px] text-foreground">
          {chunk.label}
        </span>
        {/* Bar */}
        <div
          className="bg-surface-3 rounded-full overflow-hidden shrink-0"
          style={{ width: 56, height: 4 }}
          aria-hidden="true"
        >
          <div
            className={cn('h-full rounded-full', barColor)}
            style={{ width: `${pct}%` }}
          />
        </div>
        {/* Percentage */}
        <span
          className="font-mono text-foreground-muted shrink-0 text-right"
          style={{ fontSize: 10, width: 28 }}
        >
          {pct}%
        </span>
      </div>

      {expanded && (
        <div className="grid grid-cols-2 gap-2 px-3 pb-2">
          <div>
            <p
              className="text-[11px] font-medium text-foreground-muted mb-0.5"
              aria-label="Your explanation for this concept"
            >
              Yours
            </p>
            <p className="text-[11px] text-foreground-muted leading-relaxed">
              {chunk.status === 'missing'
                ? '—'
                : 'Matched from your explanation'}
            </p>
          </div>
          <div>
            <p
              className="text-[11px] font-medium text-foreground-muted mb-0.5"
              aria-label="Source text for this concept"
            >
              Source
            </p>
            <p className="text-[11px] text-foreground-muted leading-relaxed">
              {chunk.status === 'covered'
                ? 'Source excerpt available'
                : 'No source match'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export function CoverageMap({
  chunks,
  clarityScore,
  topic,
  skepticQ,
  onAnswerSkeptic,
  source,
}: CoverageMapProps) {
  const liveRef       = useRef<HTMLDivElement>(null);
  const prevRef       = useRef<string>('');
  const timerRef      = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [compare, setCompare] = useState(false);

  const coveredCount = chunks.filter(c => c.status === 'covered').length;
  const totalCount   = chunks.length;

  // Announce coverage updates via aria-live, throttled to 4 s
  useEffect(() => {
    const summary = `${coveredCount} of ${totalCount} covered`;
    if (summary === prevRef.current) return;
    prevRef.current = summary;

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      if (liveRef.current) {
        liveRef.current.textContent = `Coverage updated. ${summary}.`;
      }
    }, 4000);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [coveredCount, totalCount]);

  return (
    <div className="flex flex-col h-full border-l border-border bg-surface-1">
      {/* Hidden live region */}
      <div ref={liveRef} aria-live="polite" aria-atomic="true" className="sr-only" />

      {/* Clarity Ring */}
      <ClarityRing clarity={clarityScore} topic={topic} />

      {/* Generic-mode badge — surfaces when the rubric fell back to LLM
          general knowledge because no chunk in the user's library matched
          the topic. Keeps the grading source transparent. */}
      {source === 'generic' && chunks.length > 0 && (
        <div
          className="mx-3 mb-2 flex items-start gap-2 rounded-md border border-warning/40 bg-warning-soft px-3 py-2"
          role="note"
        >
          <Info className="h-3.5 w-3.5 shrink-0 text-warning mt-0.5" aria-hidden="true" />
          <p className="text-[11px] text-foreground-muted leading-snug">
            <span className="font-medium text-foreground">Generic concepts</span>
            {' — no source attached. Grading against general knowledge of "'}
            {topic}
            {'".'}
          </p>
        </div>
      )}

      {/* Concept list */}
      <div
        className="flex-1 overflow-y-auto px-2 pb-2"
        role="list"
        aria-label="Concept coverage"
      >
        {chunks.length === 0 ? (
          <p className="text-[11px] text-foreground-subtle text-center py-6 px-4">
            Start typing — concepts will appear here.
          </p>
        ) : (
          chunks.map(chunk => (
            <ConceptRow key={chunk.id} chunk={chunk} expanded={compare} />
          ))
        )}
      </div>

      {/* Compare with Source toggle */}
      {chunks.length > 0 && (
        <div className="px-3 py-2 border-t border-border shrink-0">
          <button
            type="button"
            onClick={() => setCompare(v => !v)}
            className="text-[11px] text-foreground-muted hover:text-foreground transition-colors cursor-pointer"
            aria-pressed={compare}
          >
            {compare ? '⊟ Hide comparison' : 'Compare with Source ⊞'}
          </button>
        </div>
      )}

      {/* The Skeptic panel */}
      {skepticQ && (
        <div
          className="mx-3 mb-3 rounded-md border border-warning/40 border-l-2 bg-warning-soft px-3 py-2.5 shrink-0"
          style={{ borderLeftColor: 'hsl(var(--accent))' }}
        >
          <p
            className="text-[9px] uppercase tracking-widest text-warning font-medium mb-1"
            aria-hidden="true"
          >
            The Skeptic
          </p>
          <p className="text-[11px] text-foreground leading-relaxed mb-2">
            &ldquo;{skepticQ}&rdquo;
          </p>
          <button
            type="button"
            onClick={onAnswerSkeptic}
            className="text-[11px] text-primary hover:underline cursor-pointer"
          >
            Answer →
          </button>
        </div>
      )}
    </div>
  );
}
