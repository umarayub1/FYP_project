'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { X, MoreHorizontal, ArrowLeftRight, CheckCircle2, Bug, Zap } from 'lucide-react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { type Flashcard } from '@/lib/api/flashcards';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useStudySession } from '@/contexts/StudySessionContext';
import { useShortcut } from '@/hooks/useShortcut';
import { FlashcardEditDialog } from '@/components/flashcards/FlashcardEditDialog';
import { renderClozePreview } from '@/components/flashcards/ClozeEditor';
import { SessionCompleteScreen } from '@/components/flashcards/SessionCompleteScreen';
import { cn } from '@/lib/cn';
import { EmptyState } from '@/components/patterns/EmptyState';
import { useFirstTimeHint } from '@/hooks/useFirstTimeHint';
import { FirstTimeHint } from '@/components/patterns/FirstTimeHint';
import { useAIStatus } from '@/contexts/AIStatusContext';
import { toast } from 'sonner';

type Quality = 1 | 2 | 3 | 4;

const GRADE_CONFIG = [
  { q: 1 as Quality, label: 'Again', sm2Key: 'again', easeDelta: '−0.20' },
  { q: 2 as Quality, label: 'Hard',  sm2Key: 'hard',  easeDelta: '−0.15' },
  { q: 3 as Quality, label: 'Good',  sm2Key: 'good',  easeDelta: '±0.00' },
  { q: 4 as Quality, label: 'Easy',  sm2Key: 'easy',  easeDelta: '+0.15' },
] as const;

function computeNextInterval(card: Flashcard, quality: Quality): string {
  if (quality === 1) return '<10 min';
  const ef       = card.easeFactor  ?? 2.5;
  const interval = card.interval    ?? 0;
  const reps     = card.repetitions ?? 0;

  let days: number;
  if (reps === 0)       days = 1;
  else if (reps === 1)  days = 6;
  else if (quality === 2) days = Math.max(1, Math.round(interval * 1.2));
  else if (quality === 3) days = Math.max(1, Math.round(interval * ef));
  else                    days = Math.max(1, Math.round(interval * ef * 1.3));

  if (days <= 1) return '1 day';
  if (days < 7)  return `${days} days`;
  if (days < 14) return '1 week';
  if (days < 30) return `${Math.floor(days / 7)} weeks`;
  if (days < 60) return '1 month';
  return `${Math.floor(days / 30)} months`;
}

function formatTimer(s: number): string {
  const m   = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

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

function GradeButton({
  q, label, sm2Key, easeDelta, intervalPreview, onClick, reducedMotion,
}: {
  q: Quality; label: string; sm2Key: string; easeDelta: string;
  intervalPreview: string; onClick: () => void; reducedMotion: boolean;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <button
      onClick={onClick}
      style={{
        '--grade-color': `var(--sm2-${sm2Key})`,
        opacity:   visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(8px)',
        transition: reducedMotion ? 'none' : 'opacity 180ms ease-out, transform 180ms ease-out',
        borderColor: `hsl(var(--sm2-${sm2Key}))`,
      } as React.CSSProperties}
      className={cn(
        'flex flex-col items-center gap-0.5 rounded-[8px] px-2 py-3',
        'min-h-[44px] border-[0.5px]',
        'bg-transparent cursor-pointer',
        'hover:bg-[hsl(var(--grade-color)/0.08)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2',
      )}
      aria-label={`${label}: ${intervalPreview}`}
      aria-keyshortcuts={String(q)}
    >
      <span className="text-[10px] font-mono text-foreground-subtle">[{q}]</span>
      <span className="text-[13px] font-[500] text-foreground">{label}</span>
      <span className="text-[11px] text-foreground-muted">{intervalPreview}</span>
      <span
        className="text-[10px] font-mono"
        style={{ color: `hsl(var(--sm2-${sm2Key}) / 0.6)` }}
      >
        {easeDelta}
      </span>
    </button>
  );
}

function StripAction({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="text-xs text-[hsl(var(--danger))] border border-[hsl(var(--danger)/0.4)] rounded px-2 py-1 hover:bg-[hsl(var(--danger)/0.08)] cursor-pointer"
    >
      {children}
    </button>
  );
}

function AgainStrip({ card, onEdit, aiUnavailable }: { card: Flashcard; onEdit: () => void; aiUnavailable: boolean }) {
  const count = card.lapses ?? card.againCount ?? 0;
  return (
    <div className="mt-4 rounded-r-lg border-l-2 border-[hsl(var(--danger))] bg-[hsl(var(--danger-soft))] p-3">
      <p className="text-sm text-[hsl(var(--danger))] mb-2">
        {card.isLeech
          ? 'This card has been a leech for several weeks.'
          : `You've marked this Again × ${count} in the last 2 weeks.`}
      </p>
      <div className="flex gap-2 flex-wrap">
        {card.isLeech ? (
          <>
            <StripAction>Rewrite it differently</StripAction>
            {!aiUnavailable && <StripAction>Ask Coach for a mnemonic</StripAction>}
            <StripAction>Suspend it</StripAction>
          </>
        ) : (
          <>
            {!aiUnavailable && <StripAction>Get a mnemonic</StripAction>}
            {!aiUnavailable && <StripAction>Ask Coach about this</StripAction>}
            <StripAction onClick={onEdit}>Edit card</StripAction>
          </>
        )}
      </div>
    </div>
  );
}

interface FlashcardReviewClientProps {
  studySetId:       string;
  studySetName:     string;
  initialDueCards:  Flashcard[];
  initialCramMode?: boolean;
  /** When the session spans multiple sets, each card carries its own studySetId.
   *  Pass a name lookup so the header pill stays accurate per card. */
  crossSet?:        boolean;
  setNameById?:     Record<string, string>;
}

type GradeSnapshot = {
  timeoutId:         ReturnType<typeof setTimeout>;
  cardId:            string;
  quality:           Quality;
  prevCurrentIdx:    number;
  prevQueue:         Flashcard[];
  prevGoodCount:     number;
  prevAgainCount:    number;
  prevReviewedCount: number;
};

export function FlashcardReviewClient({
  studySetId, studySetName, initialDueCards, initialCramMode = false,
  crossSet = false, setNameById,
}: FlashcardReviewClientProps) {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const { startSession, endSession } = useStudySession();
  const { shouldShow: showSpaceHint } = useFirstTimeHint('hint:space-reveal');
  const { shouldShow: showGradeHint } = useFirstTimeHint('hint:grade-keys');
  const { shouldShow: showCramHint }  = useFirstTimeHint('hint:cram-mode');
  const { status: aiStatus } = useAIStatus();
  const aiUnavailable = aiStatus === 'unavailable';

  useEffect(() => {
    startSession('flashcard', studySetId);
    return () => { endSession(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [queue, setQueue]                 = useState<Flashcard[]>(initialDueCards);
  const [currentIdx, setCurrentIdx]       = useState(0);
  const [revealed, setRevealed]           = useState(false);
  const [done, setDone]                   = useState(false);
  const [cramMode, setCramMode]           = useState(initialCramMode);
  const [goodCount, setGoodCount]         = useState(0);
  const [againCount, setAgainCount]       = useState(0);
  const [reviewedCount, setReviewedCount] = useState(0);
  const [elapsed, setElapsed]             = useState(0);
  const [editOpen, setEditOpen]           = useState(false);
  const [showUndo, setShowUndo]           = useState(false);

  const pendingRef     = useRef<GradeSnapshot | null>(null);
  const undoTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cramModeRef    = useRef(initialCramMode);
  const origDeckSize   = useRef(initialDueCards.length);
  cramModeRef.current  = cramMode;

  // Timer
  useEffect(() => {
    if (done) return;
    const id = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(id);
  }, [done]);

  const card = queue[currentIdx];

  const doSubmit = useCallback(async (cardId: string, quality: Quality) => {
    if (cramModeRef.current) return;
    // In cross-set sessions, each card carries its own studySetId.
    const submitSetId = crossSet
      ? (queue.find(c => c._id === cardId)?.studySetId ?? studySetId)
      : studySetId;
    try {
      const res = await fetch(`/api/flashcards/${cardId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quality, studySetId: submitSetId }),
      });
      if (res.ok) {
        const data = await res.json() as { becameLeech?: boolean };
        if (data.becameLeech) {
          toast.warning('A card became a leech.', {
            description: 'This card has been failed too many times.',
            icon: <Bug className="h-4 w-4" />,
            duration: 8000,
            action: {
              label: 'View card',
              onClick: () => setEditOpen(true),
            },
          });
          // Mark leech on the card in local queue
          setQueue(q => q.map(c => c._id === cardId ? { ...c, isLeech: true } : c));
        }
      }
    } catch { /* optimistic */ }
  }, [studySetId, crossSet, queue]);

  const handleGrade = useCallback((quality: Quality) => {
    if (!card || done) return;

    // Commit any prior pending grade immediately
    if (pendingRef.current) {
      clearTimeout(pendingRef.current.timeoutId);
      void doSubmit(pendingRef.current.cardId, pendingRef.current.quality);
      pendingRef.current = null;
    }

    // Snapshot for undo
    const prevCurrentIdx    = currentIdx;
    const prevQueue         = queue;
    const prevGoodCount     = goodCount;
    const prevAgainCount    = againCount;
    const prevReviewedCount = reviewedCount;

    // Update accuracy counts
    if (quality >= 3) setGoodCount(c => c + 1);
    if (quality === 1) setAgainCount(c => c + 1);
    setReviewedCount(c => c + 1);

    // Show undo toast
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setShowUndo(true);
    undoTimerRef.current = setTimeout(() => setShowUndo(false), 5000);

    if (cramMode) {
      // Cram: no backend submission; Again re-queues to end
      if (quality === 1) {
        setQueue(q => {
          const nq = [...q];
          const [curr] = nq.splice(currentIdx, 1);
          nq.push(curr);
          return nq;
        });
        setRevealed(false);
      } else {
        const nextIdx = currentIdx + 1;
        if (nextIdx >= queue.length) {
          setDone(true);
        } else {
          setCurrentIdx(nextIdx);
          setRevealed(false);
        }
      }
      return;
    }

    // Normal mode: delay-submit for undo
    const cardId = card._id;
    const timeoutId = setTimeout(() => {
      void doSubmit(cardId, quality);
      pendingRef.current = null;
      setShowUndo(false);
    }, 5000);

    pendingRef.current = {
      timeoutId, cardId, quality,
      prevCurrentIdx, prevQueue, prevGoodCount, prevAgainCount, prevReviewedCount,
    };

    const nextIdx = currentIdx + 1;
    if (nextIdx >= queue.length) {
      setDone(true);
    } else {
      setCurrentIdx(nextIdx);
      setRevealed(false);
    }
  }, [card, currentIdx, done, queue, goodCount, againCount, reviewedCount, cramMode, doSubmit]);

  const handleUndo = useCallback(() => {
    if (!pendingRef.current) return;
    const { timeoutId, prevCurrentIdx, prevQueue, prevGoodCount, prevAgainCount, prevReviewedCount } = pendingRef.current;
    clearTimeout(timeoutId);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    pendingRef.current = null;
    setCurrentIdx(prevCurrentIdx);
    setQueue(prevQueue);
    setGoodCount(prevGoodCount);
    setAgainCount(prevAgainCount);
    setReviewedCount(prevReviewedCount);
    setRevealed(true);
    setDone(false);
    setShowUndo(false);
  }, []);

  const handleSkip = useCallback(() => {
    if (!card || done) return;
    setQueue(q => {
      const nq = [...q];
      const [curr] = nq.splice(currentIdx, 1);
      nq.push(curr);
      return nq;
    });
    setRevealed(false);
  }, [card, currentIdx, done]);

  const toggleCramMode = useCallback(() => setCramMode(m => !m), []);

  const reveal = useCallback(() => {
    if (!done && !revealed) setRevealed(true);
  }, [done, revealed]);

  // Shortcuts
  useShortcut('f', reveal);
  useShortcut(' ', reveal);
  useShortcut('1', () => { if (!done && revealed) handleGrade(1); });
  useShortcut('2', () => { if (!done && revealed) handleGrade(2); });
  useShortcut('3', () => { if (!done && revealed) handleGrade(3); });
  useShortcut('4', () => { if (!done && revealed) handleGrade(4); });
  useShortcut('u', handleUndo);
  useShortcut('e', () => { if (!done) setEditOpen(true); });
  useShortcut('s', handleSkip);
  useShortcut('meta+shift+c', toggleCramMode);

  // Touch swipe
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 2) {
      if (dx > 0) { if (!revealed) setRevealed(true); else handleGrade(3); }
      else         { if (revealed)  handleGrade(1); }
    }
    touchStartX.current = null;
    touchStartY.current = null;
  }, [revealed, handleGrade]);

  const handleReviewAgain = useCallback(() => {
    setQueue(initialDueCards);
    setCurrentIdx(0);
    setRevealed(false);
    setDone(false);
    setGoodCount(0);
    setAgainCount(0);
    setReviewedCount(0);
    setElapsed(0);
  }, [initialDueCards]);

  // Accuracy strip percentages (relative to original deck size)
  const total    = origDeckSize.current || 1;
  const goodPct  = (goodCount  / total) * 100;
  const againPct = (againCount / total) * 100;
  const accDisplay = reviewedCount > 0
    ? `${Math.round((goodCount / reviewedCount) * 100)}% acc.`
    : '—';

  const showAgainStrip = revealed && card && (card.isLeech || (card.lapses ?? card.againCount ?? 0) >= 2);

  if (initialDueCards.length === 0) {
    // Already cramming + 0 cards back ⇒ deck is empty or fully suspended.
    // Sending the user back into cram mode does nothing — link to the deck instead.
    const deckHref = studySetId ? `/sets/${studySetId}/flashcards` : '/flashcards';
    const cramHref = studySetId ? `/sets/${studySetId}/flashcards/review?cram=true` : '/flashcards';

    if (initialCramMode) {
      return (
        <EmptyState
          icon={<CheckCircle2 className="h-6 w-6" aria-hidden="true" />}
          headline="No cards to cram."
          subline={
            crossSet
              ? 'No active cards across your decks.'
              : 'This deck has no active cards — every card is either deleted or suspended.'
          }
          action={
            <Button asChild variant="outline">
              <Link href={crossSet ? '/flashcards' : deckHref}>
                {crossSet ? 'Back to all flashcards' : 'Back to deck'}
              </Link>
            </Button>
          }
        />
      );
    }

    return (
      <EmptyState
        icon={<CheckCircle2 className="h-6 w-6" aria-hidden="true" />}
        headline="You're caught up."
        subline={crossSet
          ? 'No cards across your decks are due right now.'
          : 'Cram to drill the whole deck without affecting your schedule, or browse all cards.'}
        action={
          <div className="flex flex-wrap items-center justify-center gap-2">
            {crossSet ? (
              <Button asChild>
                <Link href="/flashcards">Back to all flashcards</Link>
              </Button>
            ) : (
              <>
                <Button asChild>
                  <Link href={cramHref}>
                    <Zap className="h-4 w-4 mr-1.5" aria-hidden="true" />
                    Cram all cards
                  </Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href={deckHref}>View all cards</Link>
                </Button>
              </>
            )}
          </div>
        }
      />
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* 2px accuracy strip — no animation */}
      {!done && (
        <div className="flex w-full flex-none" style={{ height: 2 }} aria-hidden="true">
          <div className="h-full bg-[hsl(var(--success))]" style={{ width: `${goodPct}%` }} />
          <div className="h-full bg-[hsl(var(--danger))]"  style={{ width: `${againPct}%` }} />
          <div className="h-full bg-surface-3 flex-1" />
        </div>
      )}

      {/* Session header */}
      {!done && (
        <div className="relative flex items-center gap-3 h-10 px-4 border-b border-border flex-none text-xs font-mono text-foreground-muted">
          <span>[{currentIdx + 1}/{queue.length}]</span>
          <span>[{formatTimer(elapsed)}]</span>
          <span>[{accDisplay}]</span>
          {(() => {
            const currentSetName = crossSet && card?.studySetId
              ? (setNameById?.[card.studySetId] ?? studySetName)
              : studySetName;
            if (!currentSetName) return null;
            return (
              <span
                className="max-w-[180px] truncate rounded-full bg-primary-soft px-2 py-0.5 text-[10px] font-medium text-primary"
                title={currentSetName}
              >
                {currentSetName}
              </span>
            );
          })()}
          {cramMode && (
            <span className="rounded-full px-2 py-0.5 text-[10px] font-mono bg-[hsl(var(--accent)/0.15)] text-[hsl(var(--accent))]">
              CRAM
            </span>
          )}
          {showCramHint && !cramMode && queue.length > 0 && (
            <FirstTimeHint
              hintId="hint:cram-mode"
              content="Press ⌘⇧C for Cram Mode — review the whole deck without affecting your schedule."
              position="bottom"
            />
          )}
          <div className="flex-1" />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="p-1 rounded hover:bg-surface-2 text-foreground-muted" aria-label="More options">
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setEditOpen(true)}>Edit card [E]</DropdownMenuItem>
              <DropdownMenuItem onSelect={handleSkip}>Skip [S]</DropdownMenuItem>
              <DropdownMenuItem>Report issue</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button className="p-1 rounded hover:bg-surface-2 text-foreground-muted" aria-label="End session">
                <X className="h-4 w-4" />
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>End session?</AlertDialogTitle>
                <AlertDialogDescription>Progress is saved.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => router.push(crossSet || !studySetId ? '/flashcards' : `/sets/${studySetId}/flashcards`)}>
                  End session
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}

      {done ? (
        <SessionCompleteScreen
          studySetId={studySetId}
          studySetName={studySetName}
          reviewedCount={reviewedCount}
          goodCount={goodCount}
          againCount={againCount}
          elapsedSeconds={elapsed}
          onReviewAgain={handleReviewAgain}
        />
      ) : (
        /* Card area */
        <div
          className="flex flex-col flex-1 items-center justify-center px-content-x py-8 overflow-y-auto"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <div className="w-full max-w-xl">
            {/* Card surface */}
            <div
              className="w-full rounded-lg border border-border bg-background shadow-lg ring-1 ring-border/40 min-h-[240px] flex flex-col items-center justify-center p-8 text-center relative"
              aria-live="polite"
            >
              {/* Leech badge */}
              {card?.isLeech && (
                <span className="absolute bottom-3 left-3 rounded bg-[hsl(var(--warning-soft))] text-[hsl(var(--warning))] border border-[hsl(var(--warning)/0.5)] px-1.5 py-0.5 text-[10px] font-mono">
                  Leech
                </span>
              )}

              {/* Front */}
              <div className="w-full">
                <div className="flex items-center gap-2 mb-4">
                  <p className="text-xs font-medium uppercase tracking-wider text-foreground-subtle">Front</p>
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

              {/* Back */}
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
            <div className="mt-6 relative">
              {!revealed ? (
                <>
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
                  {showSpaceHint && (
                    <FirstTimeHint
                      hintId="hint:space-reveal"
                      content="Press Space to reveal the answer"
                      position="bottom"
                    />
                  )}
                </>
              ) : (
                <div className="relative">
                  <div className="grid grid-cols-4 gap-3" role="group" aria-label="Rate your recall">
                    {GRADE_CONFIG.map(({ q, label, sm2Key, easeDelta }) => (
                      <GradeButton
                        key={q}
                        q={q}
                        label={label}
                        sm2Key={sm2Key}
                        easeDelta={easeDelta}
                        intervalPreview={card ? computeNextInterval(card, q) : '—'}
                        onClick={() => handleGrade(q)}
                        reducedMotion={reducedMotion}
                      />
                    ))}
                  </div>
                  {showGradeHint && (
                    <FirstTimeHint
                      hintId="hint:grade-keys"
                      content="1/2/3/4 to grade. 3 (Good) is the most common."
                      position="top"
                    />
                  )}
                </div>
              )}
            </div>

            {/* Again / Leech contextual strip */}
            {showAgainStrip && (
              <AgainStrip card={card} onEdit={() => setEditOpen(true)} aiUnavailable={aiUnavailable} />
            )}

            {/* Keyboard hint */}
            <p className="mt-4 text-center text-xs text-foreground-subtle">
              {revealed
                ? 'Press 1–4 to grade · U undo · S skip · E edit · ⌘⇧C cram'
                : 'Press F or Space to reveal'}
            </p>
          </div>
        </div>
      )}

      {/* Undo toast */}
      {showUndo && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[50] bg-background border border-border rounded-lg shadow-lg px-4 py-2 flex items-center gap-3 text-sm">
          <span className="text-foreground-muted">Undo available</span>
          <button
            onClick={handleUndo}
            className="font-mono text-xs bg-surface-2 border border-border rounded px-2 py-0.5 hover:bg-surface-3 cursor-pointer"
          >
            [U]
          </button>
        </div>
      )}

      {/* Edit dialog */}
      {card && !done && (
        <FlashcardEditDialog
          open={editOpen}
          onClose={() => setEditOpen(false)}
          studySetId={studySetId}
          card={card}
          onSaved={(updated) => {
            setQueue(q => q.map(c => c._id === updated._id ? updated : c));
            setEditOpen(false);
          }}
        />
      )}
    </div>
  );
}
