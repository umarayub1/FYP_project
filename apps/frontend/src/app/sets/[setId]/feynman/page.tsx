import { AppShell } from '@/components/shell/AppShell';
import { FeynmanStartScreen } from '@/components/feynman/FeynmanStartScreen';
import { FeynmanSession } from '@/components/feynman/FeynmanSession';
import { CoachMiniPopover } from '@/components/coach/CoachMiniPopover';
import { getStudySets } from '@/lib/api/study-sets';
import { getDocuments } from '@/lib/api/documents';
import { getNotes } from '@/lib/api/notes';
import { getFeynmanSession } from '@/lib/api/feynman';

export const metadata = { title: 'Feynman — Synapse' };

export default async function FeynmanPage({
  params,
  searchParams,
}: {
  params:       Promise<{ setId: string }>;
  searchParams: Promise<{ sessionId?: string; topic?: string }>;
}) {
  const { setId }              = await params;
  const { sessionId, topic }   = await searchParams;

  const [studySets, documents, notes] = await Promise.allSettled([
    getStudySets({ includeArchived: true }),
    getDocuments(setId),
    getNotes(setId),
  ]);

  const sets    = studySets.status === 'fulfilled' ? studySets.value : [];
  const set     = sets.find(s => s._id === setId);
  const docs    = documents.status === 'fulfilled' ? documents.value : [];
  const noteList = notes.status === 'fulfilled' ? notes.value : [];

  const setCrumb     = { label: set?.name ?? setId, href: `/sets/${setId}` };
  const feynmanCrumb = { label: 'Feynman' };

  // Resume mode: render FeynmanSession directly on this page
  if (sessionId) {
    const session = await getFeynmanSession(sessionId).catch(() => null);

    if (!session) {
      return (
        <AppShell
          breadcrumb={[setCrumb, feynmanCrumb]}
          studySetName={set?.name}
          studySets={sets}
        >
          <FeynmanStartScreen
            studySetId={setId}
            studySetName={set?.name ?? setId}
            documents={docs}
            notes={noteList}
            initialTopic={topic}
          />
        </AppShell>
      );
    }

    return (
      <AppShell
        breadcrumb={[
          setCrumb,
          { label: 'Feynman', href: `/sets/${setId}/feynman` },
          { label: session.topic },
        ]}
        studySetName={set?.name}
        studySets={sets}
        hideSidePanel
      >
        <FeynmanSession session={session} setId={setId} />
        <CoachMiniPopover studySetId={setId} />
      </AppShell>
    );
  }

  return (
    <AppShell
      breadcrumb={[setCrumb, feynmanCrumb]}
      studySetName={set?.name}
      studySets={sets}
    >
      <FeynmanStartScreen
        studySetId={setId}
        studySetName={set?.name ?? setId}
        documents={docs}
        notes={noteList}
        initialTopic={topic}
      />
    </AppShell>
  );
}
