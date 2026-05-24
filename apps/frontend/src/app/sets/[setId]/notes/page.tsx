import { notFound } from 'next/navigation';
import { AppShell } from '@/components/shell/AppShell';
import { NotesPageClient } from './NotesPageClient';
import { getNotes } from '@/lib/api/notes';
import { getStudySets } from '@/lib/api/study-sets';

export const metadata = { title: 'Notes — Synapse' };

export default async function NotesListPage({ params }: { params: Promise<{ setId: string }> }) {
  const { setId } = await params;

  const [setsRes, notesRes] = await Promise.allSettled([
    getStudySets({ includeArchived: true }),
    getNotes(setId),
  ]);

  const sets  = setsRes.status  === 'fulfilled' ? setsRes.value  : [];
  const notes = notesRes.status === 'fulfilled' ? notesRes.value : [];
  const set   = sets.find(s => s._id === setId);

  if (!set && sets.length > 0) notFound();

  return (
    <AppShell
      breadcrumb={[{ label: set?.name ?? setId, href: `/sets/${setId}` }, { label: 'Notes' }]}
      studySetName={set?.name}
      studySets={sets}
    >
      <NotesPageClient setId={setId} set={set} initialNotes={notes} />
    </AppShell>
  );
}
