import { notFound } from 'next/navigation';
import Link from 'next/link';
import { AppShell } from '@/components/shell/AppShell';
import { PDFReader } from '@/components/pdf/PDFReader';
import { getDocument, getDocumentAnnotations } from '@/lib/api/documents';
import { getStudySets } from '@/lib/api/study-sets';
import { ArrowLeft, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const metadata = { title: 'Document — Synapse' };

export default async function DocumentPage({
  params,
  searchParams,
}: {
  params: Promise<{ setId: string; docId: string }>;
  searchParams: Promise<{ page?: string; highlight?: string }>;
}) {
  const [{ setId, docId }, sp] = await Promise.all([params, searchParams]);

  const [docRes, setsRes, annotationsRes] = await Promise.allSettled([
    getDocument(docId),
    getStudySets({ includeArchived: true }),
    getDocumentAnnotations(docId),
  ]);

  if (docRes.status === 'rejected') notFound();

  const doc         = docRes.value;
  const sets        = setsRes.status === 'fulfilled' ? setsRes.value : [];
  const annotations = annotationsRes.status === 'fulfilled' ? annotationsRes.value : [];
  const set         = sets.find(s => s._id === setId);

  const initialPage  = sp.page ? Math.max(1, parseInt(sp.page, 10)) : 1;
  const hasHighlight = Boolean(sp.highlight);

  return (
    <AppShell
      breadcrumb={[{ label: set?.name ?? setId, href: `/sets/${setId}` }, { label: doc.title }]}
      studySetName={set?.name}
      studySets={sets}
    >
      {/* Top bar actions */}
      <div className="flex items-center justify-between gap-4 border-b border-border px-content-x py-2 bg-background shrink-0">
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm" className="md:hidden gap-1.5 text-foreground-muted">
            <Link href={`/sets/${setId}`} aria-label="Back to study set">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Back
            </Link>
          </Button>
          <span className="text-sm font-medium text-foreground truncate max-w-64">{doc.title}</span>
        </div>
        {doc.type === 'pdf' && doc.ingestionStatus === 'ready' && (
          <Button asChild variant="ghost" size="sm">
            <a href={`/api/documents/${docId}/file`} download={doc.title} aria-label="Download PDF">
              <Download className="h-4 w-4 text-foreground-muted" aria-hidden="true" />
            </a>
          </Button>
        )}
      </div>

      {/* Reader */}
      <div className="flex-1 overflow-hidden h-[calc(100vh-7rem)]">
        {doc.type === 'pdf' && doc.ingestionStatus === 'ready' ? (
          <PDFReader
            src={`/api/documents/${docId}/file`}
            documentId={docId}
            studySetId={setId}
            documentTitle={doc.title}
            annotations={annotations}
            initialPage={initialPage}
            highlightPage={hasHighlight}
          />
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-foreground-muted">
              {doc.type !== 'pdf'
                ? 'This document is a note.'
                : 'PDF not yet available. Try again after ingestion completes.'}
            </p>
          </div>
        )}
      </div>
    </AppShell>
  );
}
