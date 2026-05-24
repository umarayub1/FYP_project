import { redirect } from 'next/navigation';
import { createNote } from '@/lib/api/notes';

export default async function NewNotePage({ params }: { params: Promise<{ setId: string }> }) {
  const { setId } = await params;
  const note = await createNote(setId, 'Untitled').catch(() => null);
  if (note) redirect(`/sets/${setId}/notes/${note._id}`);
  redirect(`/sets/${setId}/notes`);
}
