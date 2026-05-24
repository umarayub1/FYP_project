import { AppShell } from '@/components/shell/AppShell';
import { FlashcardReviewClient } from '@/app/sets/[setId]/flashcards/review/FlashcardReviewClient';
import { getStudySets } from '@/lib/api/study-sets';
import { getDueFlashcards } from '@/lib/api/flashcards';

export const metadata = { title: 'Review all due — Synapse' };

export default async function MasterReviewAllPage() {
  const sets = await getStudySets({ includeArchived: false }).catch(() => []);

  // Fetch due cards for every set in parallel; tolerate per-set failures.
  const results = await Promise.allSettled(sets.map(s => getDueFlashcards(s._id)));
  const dueCards = results.flatMap((r, i) =>
    r.status === 'fulfilled'
      ? r.value.map(c => ({ ...c, studySetId: c.studySetId ?? sets[i]._id }))
      : [],
  );

  // Shuffle so the session doesn't slog through one deck before moving on.
  for (let i = dueCards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [dueCards[i], dueCards[j]] = [dueCards[j], dueCards[i]];
  }

  const setNameById: Record<string, string> = {};
  sets.forEach(s => { setNameById[s._id] = s.name; });

  return (
    <AppShell
      breadcrumb={[
        { label: 'Flashcards', href: '/flashcards' },
        { label: 'Review all due' },
      ]}
      studySets={sets}
      hideSidePanel
    >
      <FlashcardReviewClient
        studySetId=""
        studySetName="All due cards"
        initialDueCards={dueCards}
        crossSet
        setNameById={setNameById}
      />
    </AppShell>
  );
}
