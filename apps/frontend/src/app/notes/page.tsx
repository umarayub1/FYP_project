import { AppShell } from '@/components/shell/AppShell';
import { getStudySets } from '@/lib/api/study-sets';
import { getNotes, type Note } from '@/lib/api/notes';
import { FileText, MessageSquare, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { formatDateShort } from '@/lib/format/date';

export const metadata = { title: 'Notes — Synapse' };

interface NoteRowProps {
  note: Note & { setId: string; setName: string; setColor: string };
}

function NoteRow({ note }: NoteRowProps) {
  return (
    <Link
      href={`/sets/${note.setId}/notes/${note._id}`}
      className="group flex overflow-hidden rounded-lg border border-border bg-background hover:shadow-md transition-shadow duration-150"
    >
      <div
        className="w-1 shrink-0 self-stretch"
        style={{ backgroundColor: note.setColor }}
        aria-hidden="true"
      />
      <div className="flex flex-1 min-w-0 items-center gap-3 px-4 py-3">
        <FileText className="h-4 w-4 text-foreground-muted shrink-0" aria-hidden="true" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors">
            {note.title || 'Untitled'}
          </p>
          <p className="text-xs text-foreground-subtle mt-0.5">
            {note.setName} · {formatDateShort(note.updatedAt)}
          </p>
        </div>
        {note.isCornell && (
          <span className="shrink-0 rounded-full bg-surface-3 px-2 py-0.5 text-xs font-medium text-foreground-muted">
            Cornell
          </span>
        )}
      </div>
    </Link>
  );
}

export default async function NotesPage() {
  const sets = await getStudySets({ includeArchived: true }).catch(() => []);

  const notesPerSet = await Promise.all(
    sets.map(s => getNotes(s._id).catch(() => [] as Note[]))
  );

  const groups = sets
    .map((set, i) => ({
      set,
      notes: notesPerSet[i].map(note => ({
        ...note,
        setId:    set._id,
        setName:  set.name,
        setColor: set.color,
      })),
    }))
    .filter(g => g.notes.length > 0);

  const totalNotes  = groups.reduce((sum, g) => sum + g.notes.length, 0);
  const cornellCount = groups.reduce((sum, g) => sum + g.notes.filter(n => n.isCornell).length, 0);

  return (
    <AppShell breadcrumb={[{ label: 'Notes' }]} studySets={sets}>
      {/* Stats strip */}
      <div className="border-b border-border bg-surface-2 px-content-x">
        <div className="max-w-3xl mx-auto flex items-stretch divide-x divide-border">
          <div className="flex flex-col py-4 pr-8">
            <span className="text-3xl font-mono leading-none tabular-nums text-foreground">
              {totalNotes}
            </span>
            <span className="text-[10px] font-medium uppercase tracking-widest text-foreground-subtle mt-1">
              notes
            </span>
          </div>
          {cornellCount > 0 && (
            <div className="flex flex-col py-4 px-8">
              <span className="text-3xl font-mono leading-none tabular-nums text-foreground">
                {cornellCount}
              </span>
              <span className="text-[10px] font-medium uppercase tracking-widest text-foreground-subtle mt-1">
                cornell
              </span>
            </div>
          )}
          <div className="flex flex-col py-4 px-8">
            <span className="text-3xl font-mono leading-none tabular-nums text-foreground">
              {sets.length}
            </span>
            <span className="text-[10px] font-medium uppercase tracking-widest text-foreground-subtle mt-1">
              study sets
            </span>
          </div>
        </div>
      </div>

      <div className="px-content-x py-8 max-w-3xl mx-auto">
        <h1 className="text-h1 text-foreground mb-6">Notes</h1>

        {groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-surface-2 border border-border">
              <MessageSquare className="h-7 w-7 text-foreground-subtle" aria-hidden="true" />
            </div>
            <h2 className="text-h2 text-foreground mb-2">No notes across all sets.</h2>
            <p className="text-sm text-foreground-muted max-w-xs mb-8">
              Open a study set and create your first note to capture ideas, explanations, and summaries.
            </p>
            <Link
              href="/now-brief"
              className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-fg hover:bg-primary-hover transition-colors"
            >
              Go to Now Brief
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-8">
            {groups.map(({ set, notes }) => (
              <section key={set._id} aria-label={set.name}>
                <div className="flex items-center gap-2 mb-3">
                  <span
                    className="h-2.5 w-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: set.color }}
                    aria-hidden="true"
                  />
                  <Link
                    href={`/sets/${set._id}/notes`}
                    className="text-xs font-medium uppercase tracking-widest text-foreground-muted hover:text-foreground transition-colors"
                  >
                    {set.name}
                  </Link>
                  <span className="text-xs text-foreground-subtle">
                    · {notes.length} note{notes.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <div className="flex flex-col gap-2">
                  {notes.map(note => (
                    <NoteRow key={note._id} note={note} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
