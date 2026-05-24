import { notFound } from 'next/navigation';
import Link from 'next/link';
import { AppShell } from '@/components/shell/AppShell';
import { getTagBySlug, getTagItems } from '@/lib/api/tags';
import { getStudySets } from '@/lib/api/study-sets';
import { Globe, FileText, BookOpen, MessageSquare } from 'lucide-react';

export default async function TagPage({ params }: { params: Promise<{ tagSlug: string }> }) {
  const { tagSlug } = await params;

  const [tagRes, setsRes] = await Promise.allSettled([
    getTagBySlug(tagSlug),
    getStudySets({ includeArchived: true }),
  ]);

  if (tagRes.status === 'rejected' || !tagRes.value) notFound();

  const tag   = tagRes.value;
  const sets  = setsRes.status === 'fulfilled' ? setsRes.value : [];

  const itemsRes = await getTagItems(tag._id).catch(() => ({ notes: [], flashcards: [], documents: [] }));

  return (
    <AppShell breadcrumb={[{ label: 'Tags' }, { label: tag.name }]} studySets={sets}>
      <div className="px-content-x py-8 max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-section-y">
          {tag.color && (
            <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: tag.color }} aria-hidden="true" />
          )}
          <h1 className="text-h1 text-foreground">{tag.name}</h1>
          {tag.global && (
            <span className="flex items-center gap-1 text-xs text-foreground-muted bg-surface-2 rounded-full px-2 py-0.5">
              <Globe className="h-3 w-3" aria-hidden="true" />
              Global
            </span>
          )}
        </div>

        {/* Notes */}
        <section aria-label={`Notes tagged ${tag.name}`} className="mb-8">
          <h2 className="text-h2 text-foreground mb-4 flex items-center gap-2">
            <FileText className="h-5 w-5 text-foreground-muted" aria-hidden="true" />
            Notes
            <span className="ml-1 text-xs text-foreground-subtle font-normal">{itemsRes.notes.length}</span>
          </h2>
          {itemsRes.notes.length === 0 ? (
            <div className="flex items-center gap-3 rounded-lg border border-dashed border-border px-4 py-4 text-sm text-foreground-subtle">
              <MessageSquare className="h-4 w-4 shrink-0" aria-hidden="true" />
              No notes tagged with &ldquo;{tag.name}&rdquo;
            </div>
          ) : (
            <ul className="space-y-2">
              {itemsRes.notes.map(n => {
                const set = sets.find(s => s._id === n.studySetId);
                return (
                  <li key={n._id}>
                    <Link href={`/sets/${n.studySetId}/notes/${n._id}`} className="accent-card group">
                      <div className="accent-card-bar" style={{ backgroundColor: set?.color ?? 'hsl(var(--primary))' }} aria-hidden="true" />
                      <div className="flex flex-1 min-w-0 items-center justify-between gap-4 px-4 py-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors">{n.title}</p>
                          {set && <p className="text-xs text-foreground-subtle mt-0.5">{set.name}</p>}
                        </div>
                        <span className="text-xs text-foreground-subtle shrink-0">{new Date(n.updatedAt).toLocaleDateString()}</span>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* PDFs */}
        <section aria-label={`PDFs tagged ${tag.name}`} className="mb-8">
          <h2 className="text-h2 text-foreground mb-4 flex items-center gap-2">
            <FileText className="h-5 w-5 text-foreground-muted" aria-hidden="true" />
            PDFs
            <span className="ml-1 text-xs text-foreground-subtle font-normal">{itemsRes.documents.length}</span>
          </h2>
          {itemsRes.documents.length === 0 ? (
            <div className="flex items-center gap-3 rounded-lg border border-dashed border-border px-4 py-4 text-sm text-foreground-subtle">
              <FileText className="h-4 w-4 shrink-0" aria-hidden="true" />
              No PDFs tagged with &ldquo;{tag.name}&rdquo;
            </div>
          ) : (
            <ul className="space-y-2">
              {itemsRes.documents.map(d => {
                const set = sets.find(s => s._id === d.studySetId);
                return (
                  <li key={d._id}>
                    <Link href={`/sets/${d.studySetId}/documents/${d._id}`} className="accent-card group">
                      <div className="accent-card-bar" style={{ backgroundColor: set?.color ?? 'hsl(var(--primary))' }} aria-hidden="true" />
                      <div className="flex flex-1 min-w-0 items-center justify-between gap-4 px-4 py-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors">{d.title}</p>
                          {set && <p className="text-xs text-foreground-subtle mt-0.5">{set.name}</p>}
                        </div>
                        <span className="text-xs text-foreground-subtle shrink-0">{new Date(d.updatedAt).toLocaleDateString()}</span>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Flashcards */}
        <section aria-label={`Flashcards tagged ${tag.name}`}>
          <h2 className="text-h2 text-foreground mb-4 flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-foreground-muted" aria-hidden="true" />
            Flashcards
            <span className="ml-1 text-xs text-foreground-subtle font-normal">{itemsRes.flashcards.length}</span>
          </h2>
          {itemsRes.flashcards.length === 0 ? (
            <div className="flex items-center gap-3 rounded-lg border border-dashed border-border px-4 py-4 text-sm text-foreground-subtle">
              <BookOpen className="h-4 w-4 shrink-0" aria-hidden="true" />
              No flashcards tagged with &ldquo;{tag.name}&rdquo;
            </div>
          ) : (
            <ul className="space-y-2">
              {itemsRes.flashcards.map(c => {
                const set = sets.find(s => s._id === c.studySetId);
                return (
                  <li key={c._id}>
                    <Link href={`/sets/${c.studySetId}/flashcards`} className="accent-card group">
                      <div className="accent-card-bar" style={{ backgroundColor: set?.color ?? 'hsl(var(--primary))' }} aria-hidden="true" />
                      <div className="flex flex-1 min-w-0 items-center gap-4 px-4 py-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors">{c.front}</p>
                          {set && <p className="text-xs text-foreground-subtle mt-0.5">{set.name}</p>}
                        </div>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </AppShell>
  );
}
