'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import Link from 'next/link';
import { CheckCircle2, TrendingUp, ArrowLeftRight } from 'lucide-react';
import { EmptyState } from '@/components/patterns/EmptyState';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { type Flashcard } from '@/lib/api/flashcards';
import { Button } from '@/components/ui/button';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useStudySession } from '@/contexts/StudySessionContext';
import { useShortcut } from '@/hooks/useShortcut';
import { renderClozePreview } from './ClozeEditor';
import { cn } from '@/lib/cn';

function renderKatex(text: string): string {
  return text
    .replace(/\$\$([\s\S]+?)\$\$/g, (_, m) => {
      try { return katex.renderToString(m, { displayMode: true, throwOnError: false }); }
      catch { return `$$${m}$$`; }
    })
    .replace(/\$(.+?)\$/g, (_, m) => {
      try { return katex.renderToString(m, { displayMode: false, throwOnError: false }); }
      catch { return `$${m}$`; }
    });
}

function CardText({ text }: { text: string }) {
  return (
    <div
      className="text-h2 text-foreground"
      dangerouslySetInnerHTML={{ __html: renderKatex(text) }}
    />
  );
}

type Quality = 1 | 2 | 3 | 4;

const GRADE_CONFIG: { q: Quality; label: string; desc: string; color: string }[] = [
  { q: 1, label: 'Again', desc: 'Complete blackout',   color: 'bg-sm2-again text-white' },
  { q: 2, label: 'Hard',  desc: 'Significant effort',  color: 'bg-sm2-hard  text-white' },
  { q: 3, label: 'Good',  desc: 'Correct with effort', color: 'bg-sm2-good  text-white' },
  { q: 4, label: 'Easy',  desc: 'Perfect recall',      color: 'bg-sm2-easy  text-white' },
];

interface FlashcardReviewProps {
  studySetId:      string;
  initialDueCards: Flashcard[];
}

function SessionComplete({ studySetId, reviewed }: { studySetId: string; reviewed: number }) {
  return (
    <div className="flex flex-col items-center justify-center h-full py-24 text-center px-content-x">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-success-soft">
        <CheckCircle2 className="h-8 w-8 text-success" aria-hidden="true" />
      </div>
      <h2 className="text-h1 text-foreground mb-2">Session complete!</h2>
      <p className="text-sm text-foreground-muted mb-8">
        You reviewed {reviewed} card{reviewed !== 1 ? 's' : ''}. Great work.
      </p>
      <div className="flex gap-3">
        <Button variant="outline" asChild>
          <Link href={`/sets/${studySetId}/flashcards`}>
            <TrendingUp className="h-4 w-4" aria-hidden="true" />
            View deck
          </Link>
        </Button>
        <Button asChild>
          <Link href="/now-brief">Back to Now Brief</Link>
        </Button>
      </div>
    </div>
  );
}

function ReviewNoneDueState({ studySetId }: { studySetId: string }) {
  return (
    <EmptyState
      icon={<CheckCircle2 className="h-6 w-6" aria-hidden="true" />}
      headline="You're caught up."
      subline="Come back later or get ahead now."
      action={
        <Button asChild>
          <Link href={`/sets/${studySetId}/flashcards`}>View all cards</Link>
        </Button>
      }
    />
  );
}

export function FlashcardReview({ studySetId, initialDueCards }: FlashcardReviewProps) {
  const reducedMotion = useReducedMotion();
  const { startSession, endSession } = useStudySession();

  useEffect(() => {
    startSession('flashcard', studySetId);
    return () => { endSession(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [queue, setQueue]       = useState<Flashcard[]>(initialDueCards);
  const [current, setCurrent]   = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [reviewed, setReviewed] = useState(0);
  const [grading, setGrading]   = useState(false);
  const [done, setDone]         = useState(false);

  const card = queue[current];

  const submitGrade = useCallback(async (quality: Quality) => {
    if (!card || grading) return;
    setGrading(true);

    try {
      await fetch(`/api/flashcards/${card._id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quality, studySetId: card.studySetId }),
      });
    } catch { /* optimistic — continue regardless */ }

    const nextIdx = current + 1;
    setReviewed(r => r + 1);
    setGrading(false);
    setRevealed(false);

    if (nextIdx >= queue.length) {
      setDone(true);
    } else {
      setCurrent(nextIdx);
    }
  }, [card, current, grading, queue.length]);

  // Context-aware keyboard shortcuts — only active when flashcard review is mounted
  const reveal = useCallback(() => { if (!done && !revealed) setRevealed(true); }, [done, revealed]);
  useShortcut('f', reveal);
  useShortcut(' ', reveal);
  useShortcut('1', () => { if (!done && revealed && !grading) submitGrade(1); });
  useShortcut('2', () => { if (!done && revealed && !grading) submitGrade(2); });
  useShortcut('3', () => { if (!done && revealed && !grading) submitGrade(3); });
  useShortcut('4', () => { if (!done && revealed && !grading) submitGrade(4); });

  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const deltaX = e.changedTouches[0].clientX - touchStartX.current;
    const deltaY = e.changedTouches[0].clientY - touchStartY.current;
    if (Math.abs(deltaX) > 50 && Math.abs(deltaX) > Math.abs(deltaY) * 2) {
      if (deltaX > 0) {
        if (!revealed) setRevealed(true);
        else submitGrade(3);
      } else {
        if (revealed) submitGrade(1);
      }
    }
    touchStartX.current = null;
    touchStartY.current = null;
  }, [revealed, submitGrade]);

  if (initialDueCards.length === 0) return <ReviewNoneDueState studySetId={studySetId} />;
  if (done) return <SessionComplete studySetId={studySetId} reviewed={reviewed} />;

  return (
    <div className="flex flex-col h-full items-center justify-center px-content-x py-8">
      {/* Progress */}
      <div className="w-full max-w-xl mb-8">
        <div className="flex justify-between text-xs text-foreground-subtle mb-2">
          <span>{current + 1} of {queue.length}</span>
          <span>{queue.length - current - 1} remaining</span>
        </div>
        <div className="h-0.5 w-full bg-surface-3">
          <div
            className="h-full bg-primary transition-all duration-slow"
            style={{ width: `${((current) / queue.length) * 100}%` }}
            role="progressbar"
            aria-valuenow={current}
            aria-valuemin={0}
            aria-valuemax={queue.length}
            aria-label="Review progress"
          />
        </div>
      </div>

      {/* Card */}
      <div
        className="w-full max-w-xl"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div
          className={cn(
            'w-full rounded-lg border border-border bg-background shadow-lg ring-1 ring-border/40',
            'min-h-[240px] flex flex-col items-center justify-center p-8 text-center',
            !reducedMotion && 'transition-all duration-fast'
          )}
          aria-live="polite"
        >
          {/* Front */}
          <div className="w-full">
            <div className="flex items-center gap-2 mb-4">
              <p className="text-xs font-medium uppercase tracking-wider text-foreground-subtle">
                Front
              </p>
              {card?.isBidirectional && (
                <span className="flex items-center gap-1 rounded-full bg-surface-2 border border-border px-2 py-0.5 text-xs text-foreground-muted">
                  <ArrowLeftRight className="h-3 w-3" aria-hidden="true" />
                  Bidirectional
                </span>
              )}
            </div>
            {card?.cardType === 'cloze' && card.clozeBody && card.clozeNumber ? (
              <div className="text-h2 text-foreground leading-relaxed">
                {renderClozePreview(card.clozeBody, card.clozeNumber)}
              </div>
            ) : (
              <CardText text={card?.front ?? ''} />
            )}
          </div>

          {/* Back (revealed) */}
          {revealed && card && (
            <>
              <div className="my-6 h-px w-full bg-border" aria-hidden="true" />
              <div className="w-full">
                <p className="text-xs font-medium uppercase tracking-wider text-foreground-subtle mb-4">
                  {card.cardType === 'cloze' ? 'Answer' : 'Back'}
                </p>
                {card.cardType === 'cloze' && card.clozeBody && card.clozeNumber ? (
                  <div className="text-body-lg text-foreground leading-relaxed">
                    {renderClozePreview(card.clozeBody)}
                  </div>
                ) : (
                  <CardText text={card.back} />
                )}
              </div>
            </>
          )}
        </div>

        {/* Action area */}
        <div className="mt-6">
          {!revealed ? (
            <Button
              className="w-full min-h-[44px]"
              onClick={() => setRevealed(true)}
              aria-keyshortcuts="f Space"
            >
              Show answer
              <kbd className="ml-2 rounded bg-primary-fg/20 px-1.5 py-0.5 text-xs font-mono" aria-hidden="true">
                F / Space
              </kbd>
            </Button>
          ) : (
            <div className="grid grid-cols-4 gap-3" role="group" aria-label="Rate your recall">
              {GRADE_CONFIG.map(({ q, label, desc, color }) => (
                <button
                  key={q}
                  onClick={() => submitGrade(q)}
                  disabled={grading}
                  className={cn(
                    'flex flex-col items-center gap-1 rounded-lg px-3 py-3 text-sm font-medium',
                    'min-h-[44px] min-w-[44px]',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2',
                    'cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-opacity',
                    color
                  )}
                  aria-label={`${label}: ${desc}`}
                  aria-keyshortcuts={String(q)}
                >
                  <span>{label}</span>
                  <span className="text-[10px] opacity-70 font-normal">{desc}</span>
                  <kbd className="text-xs font-mono opacity-70" aria-hidden="true">{q}</kbd>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Keyboard hint */}
        <p className="mt-4 text-center text-xs text-foreground-subtle">
          {revealed
            ? 'Press 1–4 to grade · Esc to pause'
            : 'Press F or Space to reveal'}
        </p>
      </div>
    </div>
  );
}
