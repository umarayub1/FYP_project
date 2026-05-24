'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { X, AlertTriangle } from 'lucide-react';
import { EmptyState } from '@/components/patterns/EmptyState';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { FlashcardEditDialog } from '@/components/flashcards/FlashcardEditDialog';
import { type Flashcard, suspendFlashcard } from '@/lib/api/flashcards';
import { type WeakpointsResponse, type LeechCard, type WeakTopic } from '@/lib/api/weakpoints';
import { cn } from '@/lib/cn';

const BANNER_KEY = 'weakpoints-banner-dismissed';

interface WeakPointsViewProps {
  initialData: WeakpointsResponse;
}

export function WeakPointsView({ initialData }: WeakPointsViewProps) {
  const router = useRouter();
  const [leechCards, setLeechCards] = useState<LeechCard[]>(initialData.leechCards);
  const [weakTopics]                = useState<WeakTopic[]>(initialData.weakTopics);
  const [bannerDismissed, setBannerDismissed] = useState(true);
  const [editCard, setEditCard]     = useState<LeechCard | null>(null);
  const pendingSuspendRef           = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    if (leechCards.length > 0 && !sessionStorage.getItem(BANNER_KEY)) {
      setBannerDismissed(false);
    }
  }, [leechCards.length]);

  function dismissBanner() {
    sessionStorage.setItem(BANNER_KEY, '1');
    setBannerDismissed(true);
  }

  function handleSuspend(card: LeechCard) {
    setLeechCards(prev => prev.filter(c => c._id !== card._id));

    const tid = setTimeout(async () => {
      await suspendFlashcard(card._id, card.studySetId).catch(() => {});
      delete pendingSuspendRef.current[card._id];
    }, 4000);
    pendingSuspendRef.current[card._id] = tid;

    toast('Card suspended.', {
      action: {
        label:   'Undo',
        onClick: () => {
          clearTimeout(pendingSuspendRef.current[card._id]);
          delete pendingSuspendRef.current[card._id];
          setLeechCards(prev => {
            if (prev.some(c => c._id === card._id)) return prev;
            return [...prev, card];
          });
        },
      },
    });
  }

  function handleCoach(card: LeechCard) {
    router.push(`/sets/${card.studySetId}/coach?cardId=${encodeURIComponent(card._id)}`);
  }

  function handleCardSaved(saved: Flashcard) {
    setLeechCards(prev =>
      prev.map(c => c._id === saved._id ? { ...c, front: saved.front, back: saved.back } : c)
    );
    setEditCard(null);
  }

  const isEmpty = leechCards.length === 0 && weakTopics.length === 0;

  return (
    <>
      {/* Leech banner */}
      {!bannerDismissed && leechCards.length > 0 && (
        <div className="mb-6 flex items-center gap-3 rounded-lg border border-warning/30 bg-warning-soft px-4 py-3">
          <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
          <p className="flex-1 text-sm text-foreground">
            <span className="font-medium">{leechCards.length} leech card{leechCards.length > 1 ? 's' : ''} detected.</span>
            {' '}These cards need attention — consider rewriting or asking Coach for help.
          </p>
          <button
            type="button"
            onClick={dismissBanner}
            className="shrink-0 rounded p-0.5 text-foreground-muted hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            aria-label="Dismiss banner"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {isEmpty ? (
        <EmptyState
          icon={<AlertTriangle className="h-6 w-6" aria-hidden="true" />}
          headline="No weak topics yet."
          subline="Keep reviewing and Synapse will flag struggles."
          action={
            <Button asChild>
              <Link href="/flashcards">Start review</Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-8">
          {/* Leech cards section */}
          {leechCards.length > 0 && (
            <section>
              <p className="mb-3 text-[10px] font-mono font-medium uppercase tracking-widest text-foreground-subtle">
                Leech Cards <span className="ml-1 tabular-nums">[{leechCards.length}]</span>
              </p>
              <div className="divide-y divide-border rounded-lg border border-border">
                {leechCards.map(card => (
                  <LeechCardRow
                    key={card._id}
                    card={card}
                    onRewrite={() => setEditCard(card)}
                    onCoach={() => handleCoach(card)}
                    onSuspend={() => handleSuspend(card)}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Feynman gaps section */}
          {weakTopics.length > 0 && (
            <section>
              <p className="mb-3 text-[10px] font-mono font-medium uppercase tracking-widest text-foreground-subtle">
                Feynman Gaps <span className="ml-1 tabular-nums">[{weakTopics.length}]</span>
              </p>
              <div className="divide-y divide-border rounded-lg border border-border">
                {weakTopics.map(topic => (
                  <FeynmanGapRow key={`${topic.studySetId}-${topic.topic}`} topic={topic} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* Edit dialog */}
      {editCard && (
        <FlashcardEditDialog
          open
          onClose={() => setEditCard(null)}
          studySetId={editCard.studySetId}
          card={{
            _id:        editCard._id,
            userId:     '',
            studySetId: editCard.studySetId,
            cardType:   'basic',
            front:      editCard.front,
            back:       editCard.back,
            tags:       [],
          }}
          onSaved={handleCardSaved}
        />
      )}
    </>
  );
}

function LeechCardRow({
  card,
  onRewrite,
  onCoach,
  onSuspend,
}: {
  card:      LeechCard;
  onRewrite: () => void;
  onCoach:   () => void;
  onSuspend: () => void;
}) {
  return (
    <div className="group flex h-9 items-center gap-3 px-3 hover:bg-surface transition-colors">
      {/* Leech badge */}
      <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-mono font-medium bg-warning-soft text-warning">
        Leech
      </span>

      {/* Front text */}
      <span className="flex-1 truncate text-[13px] text-foreground">
        {card.front}
      </span>

      {/* Again count */}
      <span className="shrink-0 text-[11px] font-mono text-danger tabular-nums">
        Again × {card.againCount ?? 0}
      </span>

      {/* Actions */}
      <div className="flex shrink-0 items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          type="button"
          onClick={onRewrite}
          className="rounded px-2 py-1 text-[11px] text-foreground-muted hover:text-foreground hover:bg-surface-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        >
          Rewrite
        </button>
        <button
          type="button"
          onClick={onCoach}
          className="rounded px-2 py-1 text-[11px] text-foreground-muted hover:text-foreground hover:bg-surface-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        >
          Coach
        </button>
        <button
          type="button"
          onClick={onSuspend}
          className="rounded px-2 py-1 text-[11px] text-foreground-muted hover:text-foreground hover:bg-surface-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        >
          Suspend
        </button>
      </div>
    </div>
  );
}

function FeynmanGapRow({ topic }: { topic: WeakTopic }) {
  const pct         = Math.round(topic.clarityScore * 100);
  const clarityColor = topic.clarityScore < 0.2 ? 'text-danger' : 'text-warning';
  const feynmanHref = `/sets/${topic.studySetId}/feynman?topic=${encodeURIComponent(topic.topic)}`;

  return (
    <div className="group flex h-9 items-center gap-3 px-3 hover:bg-surface transition-colors">
      {/* Topic + set name */}
      <span className="flex-1 truncate text-[13px] text-foreground">
        {topic.topic}
        {topic.studySetName && (
          <span className="ml-1.5 text-[11px] text-foreground-muted">· {topic.studySetName}</span>
        )}
      </span>

      {/* Clarity */}
      <span className={cn('shrink-0 text-[11px] font-mono tabular-nums', clarityColor)}>
        {pct}% clarity
      </span>

      {/* Start Feynman */}
      <Link
        href={feynmanHref}
        className="shrink-0 rounded px-2 py-1 text-[11px] text-primary hover:underline transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
      >
        Start Feynman
      </Link>
    </div>
  );
}
