import { AppShell } from '@/components/shell/AppShell';
import { FlashcardReviewClient } from './FlashcardReviewClient';
import { getStudySets } from '@/lib/api/study-sets';
import { getDueFlashcards, getCramFlashcards } from '@/lib/api/flashcards';

export const metadata = { title: 'Review — Synapse' };

export default async function FlashcardReviewPage({
  params,
  searchParams,
}: {
  params:       Promise<{ setId: string }>;
  searchParams: Promise<{ cram?: string }>;
}) {
  const { setId }  = await params;
  const { cram }   = await searchParams;

  const [studySets, dueCards] = await Promise.allSettled([
    getStudySets({ includeArchived: true }),
    cram === 'true' ? getCramFlashcards(setId) : getDueFlashcards(setId),
  ]);

  const sets  = studySets.status === 'fulfilled' ? studySets.value : [];
  const set   = sets.find(s => s._id === setId);
  const cards = dueCards.status  === 'fulfilled' ? dueCards.value  : [];

  return (
    <AppShell
      breadcrumb={[
        { label: set?.name ?? setId, href: `/sets/${setId}` },
        { label: 'Flashcards', href: `/sets/${setId}/flashcards` },
        { label: 'Review' },
      ]}
      studySetName={set?.name}
      studySets={sets}
      hideSidePanel
    >
      <FlashcardReviewClient
        studySetId={setId}
        studySetName={set?.name ?? setId}
        initialDueCards={cards}
        initialCramMode={cram === 'true'}
      />
    </AppShell>
  );
}
