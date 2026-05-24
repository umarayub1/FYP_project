import { notFound } from 'next/navigation';
import { AppShell } from '@/components/shell/AppShell';
import { DocumentList } from '@/components/studyset/DocumentList';
import { DeadlineRibbon } from '@/components/studyset/DeadlineRibbon';
import { DeadlineEditorWidget } from '@/components/deadline/DeadlineEditorWidget';
import { PulseCards } from '@/components/studyset/PulseCards';
import { WeakSpotsStrip, type WeakSpot } from '@/components/studyset/WeakSpotsStrip';
import { getStudySets, getSetAnalytics, type Deadline } from '@/lib/api/study-sets';
import { getDocuments } from '@/lib/api/documents';
import { getFlashcards } from '@/lib/api/flashcards';
import { BarChart2, BookOpen, FileText, Zap } from 'lucide-react';
import Link from 'next/link';

function getNearestDeadline(deadlines: Deadline[]): Deadline | null {
  const today = new Date().toISOString().split('T')[0];
  const active = deadlines
    .filter(d => !d.passedAt && d.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date));
  return active[0] ?? null;
}

export default async function StudySetPage({
  params,
  searchParams,
}: {
  params:       Promise<{ setId: string }>;
  searchParams: Promise<{ panel?: string }>;
}) {
  const [{ setId }, { panel }] = await Promise.all([params, searchParams]);

  const [studySets, docs, flashcardData, analyticsData] = await Promise.allSettled([
    getStudySets({ includeArchived: true }),
    getDocuments(setId),
    getFlashcards(setId),
    getSetAnalytics(setId),
  ]);

  const sets       = studySets.status     === 'fulfilled' ? studySets.value     : [];
  const set        = sets.find(s => s._id === setId);
  const documents  = docs.status          === 'fulfilled' ? docs.value          : [];
  const flashcards = flashcardData.status === 'fulfilled' ? flashcardData.value : { cards: [], dueCount: 0, total: 0 };
  const analytics  = analyticsData.status === 'fulfilled' ? analyticsData.value : null;

  if (!set && sets.length > 0) notFound();

  const deadlines       = set?.deadlines ?? [];
  const nearestDeadline = getNearestDeadline(deadlines);

  // Overdue = cards with a dueDate strictly before today midnight
  const todayMidnight = new Date();
  todayMidnight.setHours(0, 0, 0, 0);
  const overdueCount = flashcards.cards.filter(
    c => c.dueDate && new Date(c.dueDate) < todayMidnight
  ).length;

  // Weak spots = cards with low ease factor or flagged as leeches
  const weakSpots: WeakSpot[] = flashcards.cards
    .filter(c => (c.easeFactor != null && c.easeFactor < 1.8) || c.suspended)
    .slice(0, 10)
    .map(c => ({ id: c._id, front: c.front }));

  return (
    <AppShell
      breadcrumb={[{ label: set?.name ?? setId }]}
      studySetName={set?.name}
      studySets={sets}
    >
      {set?.color && (
        <div className="h-1.5 w-full" style={{ backgroundColor: `hsl(var(${set.color}))` }} aria-hidden="true" />
      )}
      <div className="px-content-x py-8 max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-section-y">
          <div className="flex items-center gap-3">
            {set?.color && (
              <span
                className="h-4 w-4 rounded-full shrink-0"
                style={{ backgroundColor: `hsl(var(${set.color}))` }}
                aria-hidden="true"
              />
            )}
            <h1 className="text-h1 text-foreground">{set?.name ?? setId}</h1>
          </div>
          <DeadlineEditorWidget setId={setId} existingDeadline={nearestDeadline} autoOpen={panel === 'deadlines'} />
        </div>

        {/* Spec-accurate deadline ribbon */}
        <DeadlineRibbon
          deadline={nearestDeadline}
          set={set ?? { _id: setId, name: setId, color: '', userId: '', deadlines: [], createdAt: '', updatedAt: '' }}
          analytics={analytics}
          setId={setId}
        />

        {/* Quick-action tab strip */}
        <nav className="flex gap-px bg-surface-2 rounded-lg p-1 mb-section-y" aria-label="Study set actions">
          <Link href={`/sets/${setId}/flashcards`} className="flex items-center gap-2 rounded-md px-4 py-1.5 text-sm font-medium text-foreground-muted hover:text-foreground hover:bg-background transition-colors">
            <BookOpen className="h-4 w-4" aria-hidden="true" />
            Flashcards
            {flashcards.dueCount > 0 && (
              <span className="ml-0.5 rounded-full bg-primary/15 px-1.5 text-xs font-mono text-primary">
                {flashcards.dueCount}
              </span>
            )}
          </Link>
          <Link href={`/sets/${setId}/feynman`} className="flex items-center gap-2 rounded-md px-4 py-1.5 text-sm font-medium text-foreground-muted hover:text-foreground hover:bg-background transition-colors">
            <Zap className="h-4 w-4" aria-hidden="true" />
            Feynman
          </Link>
          <Link href={`/sets/${setId}/notes`} className="flex items-center gap-2 rounded-md px-4 py-1.5 text-sm font-medium text-foreground-muted hover:text-foreground hover:bg-background transition-colors">
            <FileText className="h-4 w-4" aria-hidden="true" />
            Notes
          </Link>
          <Link href={`/sets/${setId}/analytics`} className="flex items-center gap-2 rounded-md px-4 py-1.5 text-sm font-medium text-foreground-muted hover:text-foreground hover:bg-background transition-colors">
            <BarChart2 className="h-4 w-4" aria-hidden="true" />
            Analytics
          </Link>
        </nav>

        {/* Pulse cards — 3-column instrument panel */}
        <PulseCards
          analytics={analytics}
          setId={setId}
          dueCount={flashcards.dueCount}
          overdueCount={overdueCount}
          totalCards={flashcards.total}
          hasDeadline={nearestDeadline !== null}
        />

        {/* Weak spots strip */}
        <WeakSpotsStrip weakSpots={weakSpots} setId={setId} />

        {/* Documents section */}
        <section aria-label="Documents">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-h2 text-foreground">Documents</h2>
            <span className="text-xs text-foreground-subtle">
              {documents.length} file{documents.length !== 1 ? 's' : ''}
            </span>
          </div>
          <DocumentList docs={documents} studySetId={setId} studySets={sets} />
        </section>
      </div>
    </AppShell>
  );
}
