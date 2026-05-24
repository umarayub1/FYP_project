import { AppShell } from '@/components/shell/AppShell';
import { CoachPageLayout } from '@/components/coach/CoachPageLayout';
import { getStudySets } from '@/lib/api/study-sets';

export const metadata = { title: 'Smart Coach — Synapse' };

export default async function CoachPage({
  params,
}: {
  params: Promise<{ setId: string }>;
}) {
  const { setId } = await params;

  const studySets = await getStudySets({ includeArchived: true }).catch(() => []);
  const set = studySets.find(s => s._id === setId);

  return (
    <AppShell
      breadcrumb={[{ label: set?.name ?? setId, href: `/sets/${setId}` }, { label: 'Coach' }]}
      studySetName={set?.name}
      studySets={studySets}
      hideSidePanel
    >
      <CoachPageLayout studySetId={setId} studySetName={set?.name} />
    </AppShell>
  );
}
