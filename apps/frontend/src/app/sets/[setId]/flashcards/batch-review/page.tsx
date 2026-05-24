import { AppShell } from '@/components/shell/AppShell';
import { BatchReviewTable } from '@/components/flashcards/BatchReviewTable';
import { getStudySets } from '@/lib/api/study-sets';
import { getFlashcards } from '@/lib/api/flashcards';

export const metadata = { title: 'Batch Review — Synapse' };

export default async function BatchReviewPage({ params }: { params: Promise<{ setId: string }> }) {
  const { setId } = await params;

  const [studySets, flashcardData] = await Promise.allSettled([
    getStudySets({ includeArchived: true }),
    getFlashcards(setId),
  ]);

  const sets      = studySets.status    === 'fulfilled' ? studySets.value    : [];
  const set       = sets.find(s => s._id === setId);
  const flashcards = flashcardData.status === 'fulfilled' ? flashcardData.value : { cards: [], dueCount: 0, total: 0 };

  return (
    <AppShell
      breadcrumb={[
        { label: set?.name ?? setId, href: `/sets/${setId}` },
        { label: 'Flashcards', href: `/sets/${setId}/flashcards` },
        { label: 'Batch Review' },
      ]}
      studySetName={set?.name}
      studySets={sets}
    >
      <BatchReviewTable
        studySetId={setId}
        studySetName={set?.name ?? setId}
        initialCards={flashcards.cards}
      />
    </AppShell>
  );
}
