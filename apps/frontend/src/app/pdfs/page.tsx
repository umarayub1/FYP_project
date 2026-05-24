import { AppShell } from '@/components/shell/AppShell';
import { getStudySets } from '@/lib/api/study-sets';
import { getDocuments, type SynapseDocument } from '@/lib/api/documents';
import { FileText, CheckCircle2, Loader2, AlertOctagon, Clock, FolderOpen, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { formatDateShort } from '@/lib/format/date';
import { cn } from '@/lib/cn';

export const metadata = { title: 'PDFs — Synapse' };

function StatusBadge({ status }: { status: SynapseDocument['ingestionStatus'] }) {
  if (status === 'ready') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 text-xs font-medium text-success shrink-0">
        <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
        Ready
      </span>
    );
  }
  if (status === 'processing') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary shrink-0">
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
        Processing
      </span>
    );
  }
  if (status === 'failed') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-danger-soft px-2 py-0.5 text-xs font-medium text-danger shrink-0">
        <AlertOctagon className="h-3 w-3" aria-hidden="true" />
        Failed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-surface-3 px-2 py-0.5 text-xs font-medium text-foreground-subtle shrink-0">
      <Clock className="h-3 w-3" aria-hidden="true" />
      Pending
    </span>
  );
}

interface DocRowProps {
  doc: SynapseDocument & { setId: string; setColor: string };
}

function DocRow({ doc }: DocRowProps) {
  const href = doc.ingestionStatus === 'ready'
    ? `/sets/${doc.setId}/documents/${doc._id}`
    : `/sets/${doc.setId}`;

  return (
    <Link
      href={href}
      className="group flex overflow-hidden rounded-lg border border-border bg-background hover:shadow-md transition-shadow duration-150"
    >
      <div
        className="w-1 shrink-0 self-stretch"
        style={{ backgroundColor: doc.setColor }}
        aria-hidden="true"
      />
      <div className="flex flex-1 min-w-0 items-center gap-3 px-4 py-3">
        <FileText className="h-4 w-4 text-foreground-muted shrink-0" aria-hidden="true" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors">
            {doc.title}
          </p>
          <p className="text-xs text-foreground-subtle mt-0.5">
            {formatDateShort(doc.createdAt)}
          </p>
        </div>
        <StatusBadge status={doc.ingestionStatus} />
      </div>
    </Link>
  );
}

export default async function PdfsPage() {
  const sets = await getStudySets({ includeArchived: true }).catch(() => []);

  const docsPerSet = await Promise.all(
    sets.map(s => getDocuments(s._id).catch(() => []))
  );

  const groups = sets
    .map((set, i) => ({
      set,
      docs: docsPerSet[i].map(doc => ({ ...doc, setId: set._id, setColor: set.color })),
    }))
    .filter(g => g.docs.length > 0);

  const totalDocs      = groups.reduce((sum, g) => sum + g.docs.length, 0);
  const readyCount     = groups.reduce((sum, g) => sum + g.docs.filter(d => d.ingestionStatus === 'ready').length, 0);
  const processingCount = groups.reduce((sum, g) => sum + g.docs.filter(d => d.ingestionStatus === 'processing').length, 0);

  return (
    <AppShell breadcrumb={['PDFs']} studySets={sets}>
      {/* Stats strip */}
      <div className="border-b border-border bg-surface-2 px-content-x">
        <div className="max-w-3xl mx-auto flex items-stretch divide-x divide-border">
          <div className="flex flex-col py-4 pr-8">
            <span className={cn(
              'text-3xl font-mono leading-none tabular-nums',
              totalDocs > 0 ? 'text-foreground' : 'text-foreground-muted'
            )}>
              {totalDocs}
            </span>
            <span className="text-[10px] font-medium uppercase tracking-widest text-foreground-subtle mt-1">
              documents
            </span>
          </div>
          <div className="flex flex-col py-4 px-8">
            <span className={cn(
              'text-3xl font-mono leading-none tabular-nums',
              readyCount > 0 ? 'text-success' : 'text-foreground-muted'
            )}>
              {readyCount}
            </span>
            <span className="text-[10px] font-medium uppercase tracking-widest text-foreground-subtle mt-1">
              ready
            </span>
          </div>
          {processingCount > 0 && (
            <div className="flex flex-col py-4 px-8">
              <span className="text-3xl font-mono leading-none tabular-nums text-primary">
                {processingCount}
              </span>
              <span className="text-[10px] font-medium uppercase tracking-widest text-foreground-subtle mt-1">
                processing
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="px-content-x py-8 max-w-3xl mx-auto">
        <h1 className="text-h1 text-foreground mb-6">PDFs</h1>

        {groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-surface-2 border border-border">
              <FolderOpen className="h-7 w-7 text-foreground-subtle" aria-hidden="true" />
            </div>
            <h2 className="text-h2 text-foreground mb-2">No PDFs yet</h2>
            <p className="text-sm text-foreground-muted max-w-xs mb-8">
              Open a study set and upload a PDF to start building your knowledge base.
            </p>
            <Link
              href="/"
              className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-fg hover:bg-primary-hover transition-colors"
            >
              Go to Now Brief
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-8">
            {groups.map(({ set, docs }) => (
              <section key={set._id} aria-label={set.name}>
                {/* Set group header */}
                <div className="flex items-center gap-2 mb-3">
                  <span
                    className="h-2.5 w-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: set.color }}
                    aria-hidden="true"
                  />
                  <Link
                    href={`/sets/${set._id}`}
                    className="text-xs font-medium uppercase tracking-widest text-foreground-muted hover:text-foreground transition-colors"
                  >
                    {set.name}
                  </Link>
                  <span className="text-xs text-foreground-subtle">
                    · {docs.length} file{docs.length !== 1 ? 's' : ''}
                  </span>
                </div>

                <div className="flex flex-col gap-2">
                  {docs.map(doc => (
                    <DocRow key={doc._id} doc={doc} />
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
