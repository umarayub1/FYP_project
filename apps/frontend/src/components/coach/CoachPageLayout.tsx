'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { CoachChat, type LeechCardContext } from '@/components/coach/CoachChat';
import { getFlashcards } from '@/lib/api/flashcards';

interface CoachPageLayoutProps {
  studySetId: string;
  studySetName?: string;
}

function buildLeechPrompt(card: LeechCardContext): string {
  const body = card.cardType === 'cloze' && card.clozeBody
    ? `Cloze: ${card.clozeBody}`
    : `Front: ${card.front}\nBack: ${card.back}`;
  return `I keep getting this flashcard wrong — it became a "leech" card. Please help me actually understand it.

${body}

Walk me through it using these techniques:
1. **Feynman:** explain the underlying concept in plain language, as if teaching a beginner. Identify what makes this concept tricky.
2. **Bloom's taxonomy:** start at *remember*, then *understand*, then *apply* — give a small concrete example I can work through.
3. **Card critique:** look at the wording above. If it's ambiguous, leading, or testing the wrong thing, suggest a clearer rewrite (front + back) I can use to replace it.
4. **Check-back:** end with one short question that probes whether I've grasped it, so we can continue Socratically.`;
}

export function CoachPageLayout({ studySetId, studySetName }: CoachPageLayoutProps) {
  const searchParams = useSearchParams();
  const cardId = searchParams.get('cardId');
  const [cardContext, setCardContext] = useState<LeechCardContext | null>(null);

  useEffect(() => {
    if (!cardId) { setCardContext(null); return; }
    let cancelled = false;
    getFlashcards(studySetId)
      .then(({ cards }) => {
        if (cancelled) return;
        const card = cards.find(c => c._id === cardId);
        if (!card) return;
        setCardContext({
          _id:        card._id,
          studySetId: card.studySetId,
          cardType:   card.cardType,
          front:      card.front,
          back:       card.back,
          clozeBody:  card.clozeBody,
          tags:       card.tags,
          againCount: card.lapses ?? card.againCount,
        });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [cardId, studySetId]);

  const initialMessage = cardContext ? buildLeechPrompt(cardContext) : undefined;

  return (
    <div className="h-full overflow-hidden">
      <CoachChat
        studySetId={studySetId}
        studySetName={studySetName}
        fullPage
        cardContext={cardContext ?? undefined}
        initialMessage={initialMessage}
      />
    </div>
  );
}
