import { notFound } from 'next/navigation';
import Link from 'next/link';
import { AppShell } from '@/components/shell/AppShell';
import { getNote } from '@/lib/api/notes';
import { getStudySets } from '@/lib/api/study-sets';
import { NoteEditorClient } from './NoteEditorClient';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default async function NoteEditorPage({ params }: { params: Promise<{ setId: string; noteId: string }> }) {
  const { setId, noteId } = await params;

  const [noteRes, setsRes] = await Promise.allSettled([
    getNote(noteId, setId),
    getStudySets({ includeArchived: true }),
  ]);

  if (noteRes.status === 'rejected') notFound();

  const note = noteRes.value;
  const sets = setsRes.status === 'fulfilled' ? setsRes.value : [];
  const set  = sets.find(s => s._id === setId);

  return (
    <AppShell
      breadcrumb={[set?.name ?? setId, 'Notes', note.title || 'Untitled']}
      studySetName={set?.name}
      studySets={sets}
    >
      <NoteEditorClient initialNote={note} setId={setId} />
    </AppShell>
  );
}
