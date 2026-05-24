import { AppShell } from '@/components/shell/AppShell';
import { FeynmanSession } from '@/components/feynman/FeynmanSession';
import { getStudySets } from '@/lib/api/study-sets';
import { getFeynmanSession } from '@/lib/api/feynman';

export const metadata = { title: 'Feynman Session — Synapse' };

export default async function FeynmanSessionPage({
  params,
}: {
  params: Promise<{ setId: string; sessionId: string }>;
}) {
  const { setId, sessionId } = await params;

  const [studySets, session] = await Promise.allSettled([
    getStudySets({ includeArchived: true }),
    getFeynmanSession(sessionId),
  ]);

  const sets = studySets.status === 'fulfilled' ? studySets.value : [];
  const set  = sets.find(s => s._id === setId);

  const feynmanCrumbs = [
    { label: set?.name ?? setId, href: `/sets/${setId}` },
    { label: 'Feynman', href: `/sets/${setId}/feynman` },
  ];

  if (session.status === 'rejected') {
    return (
      <AppShell breadcrumb={[...feynmanCrumbs, { label: 'Session' }]} studySetName={set?.name} studySets={sets} hideSidePanel>
        <div className="flex flex-col items-center justify-center h-full py-24 text-center px-content-x">
          <p className="text-sm text-foreground-muted">Session not found.</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      breadcrumb={[...feynmanCrumbs, { label: session.value.topic }]}
      studySetName={set?.name}
      studySets={sets}
      hideSidePanel
    >
      <FeynmanSession session={session.value} setId={setId} />
    </AppShell>
  );
}
