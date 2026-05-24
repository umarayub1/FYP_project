'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, AlertTriangle } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useIngestionProgress } from '@/hooks/useIngestionProgress';
import type { SynapseDocument } from '@/lib/api/documents';

interface ProcessingSheetProps {
  doc:     SynapseDocument;
  setId:   string;
  open:    boolean;
  onClose: () => void;
}

export function ProcessingSheet({ doc, setId, open, onClose }: ProcessingSheetProps) {
  const router = useRouter();
  const progress = useIngestionProgress(open ? doc._id : null);

  // Once the document is ready, navigate into the reader and close the sheet.
  useEffect(() => {
    if (!open) return;
    if (doc.ingestionStatus === 'ready' || progress?.stage === 'complete' || progress?.percent === 100) {
      router.push(`/sets/${setId}/documents/${doc._id}`);
      onClose();
    }
  }, [open, doc.ingestionStatus, progress?.stage, progress?.percent, doc._id, setId, router, onClose]);

  const failed = doc.ingestionStatus === 'failed' || progress?.stage === 'error';
  const percent = Math.max(0, Math.min(100, progress?.percent ?? 0));
  const stageLabel = failed
    ? 'Processing failed'
    : (progress?.message ?? 'Waiting for processing…');

  return (
    <Sheet open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <SheetContent side="right" className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="font-serif">Still processing</SheetTitle>
          <p className="text-xs text-[hsl(var(--foreground-muted))] truncate font-mono">{doc.title}</p>
        </SheetHeader>

        <div className="px-6 py-6 flex flex-col gap-6" aria-live="polite">
          <div className="flex items-center gap-3">
            {failed ? (
              <AlertTriangle className="h-5 w-5 text-[hsl(var(--danger))]" aria-hidden="true" />
            ) : (
              <Loader2 className="h-5 w-5 animate-spin text-[hsl(var(--primary))]" aria-hidden="true" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm text-foreground">{stageLabel}</p>
              <p className="mt-0.5 font-mono text-[12px] text-[hsl(var(--foreground-muted))]">
                {failed ? 'Try re-ingesting from the row menu.' : `${percent}% done`}
              </p>
            </div>
          </div>

          {!failed && (
            <div className="h-1 w-full overflow-hidden rounded-full bg-[hsl(var(--surface-2))]">
              <div
                className="h-full bg-[hsl(var(--primary))] transition-[width] duration-300"
                style={{ width: `${percent}%` }}
                role="progressbar"
                aria-valuenow={percent}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Ingestion progress"
              />
            </div>
          )}

          <p className="text-xs text-[hsl(var(--foreground-muted))]">
            We&apos;ll open the reader automatically as soon as it&apos;s ready.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
