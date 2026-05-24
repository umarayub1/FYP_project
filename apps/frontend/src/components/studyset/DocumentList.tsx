'use client';

import { useState, useRef, useCallback, useEffect, memo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  FileText, Upload, Loader2,
} from 'lucide-react';
import type { StudySet } from '@/lib/api/study-sets';
import { EmptyState } from '@/components/patterns/EmptyState';
import { type SynapseDocument, getDocument, bulkDeleteDocuments, bulkMoveDocuments } from '@/lib/api/documents';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { formatRelative } from '@/lib/format/date';
import { formatBytes } from '@/lib/format/bytes';
import { cn } from '@/lib/cn';
import { useIngestionProgress } from '@/hooks/useIngestionProgress';
import { getSocket } from '@/lib/socket';
import { DocumentRowMenu } from '@/components/pdf/DocumentRowMenu';
import { ProcessingSheet } from '@/components/pdf/ProcessingSheet';
import { useBulkSelection } from '@/hooks/useBulkSelection';
import { Marquee } from '@/components/patterns/Marquee';
import { BulkActionBar } from '@/components/patterns/BulkActionBar';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';

interface UploadState {
  id: string;
  file: File;
  xhrProgress: number;
  status: 'uploading' | 'ingesting' | 'done' | 'error';
  docId?: string;
  error?: string;
}

function StatusBadge({ status }: { status: SynapseDocument['ingestionStatus'] }) {
  if (status === 'ready') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[hsl(var(--success-soft))] px-2 py-0.5 font-mono text-[11px] text-[hsl(var(--success))]">
        Ready
      </span>
    );
  }
  if (status === 'failed') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[hsl(var(--danger-soft))] px-2 py-0.5 font-mono text-[11px] text-[hsl(var(--danger))]">
        Failed
      </span>
    );
  }
  if (status === 'processing') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-[hsl(var(--warning-soft))] px-2 py-0.5 font-mono text-[11px] text-[hsl(var(--warning))]">
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
        Processing
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[hsl(var(--warning-soft))] px-2 py-0.5 font-mono text-[11px] text-[hsl(var(--warning))]">
      Pending
    </span>
  );
}

function DocIngestionProgress({ docId }: { docId: string }) {
  const progress = useIngestionProgress(docId);
  if (!progress || progress.percent === 0) return null;
  return (
    <div
      className="absolute bottom-0 left-0 h-[2px] bg-[hsl(var(--primary))]"
      style={{ width: `${progress.percent}%` }}
      role="progressbar"
      aria-valuenow={progress.percent}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Ingestion progress"
    />
  );
}

interface DocRowProps {
  doc:         SynapseDocument;
  setId:       string;
  studySets:   StudySet[];
  onMutated:   (next: SynapseDocument | null) => void;
  onOpenSheet: (doc: SynapseDocument) => void;
  selected:    boolean;
  onToggle:    (id: string, e: React.MouseEvent) => void;
}

const DocRow = memo(function DocRow({ doc, setId, studySets, onMutated, onOpenSheet, selected, onToggle }: DocRowProps) {
  const ready = doc.type === 'pdf' && doc.ingestionStatus === 'ready';
  const href  = ready ? `/sets/${setId}/documents/${doc._id}` : undefined;

  const metaParts: string[] = [];
  if (doc.pageCount != null) metaParts.push(`${doc.pageCount} pages`);
  if (doc.cardsGenerated != null) metaParts.push(`${doc.cardsGenerated} cards generated`);
  metaParts.push(`Uploaded ${formatRelative(doc.createdAt)}`);

  const inner = (
    <div
      data-selectable-id={doc._id}
      className={cn(
        'relative flex items-center gap-3 px-4 min-h-[48px] py-2.5 hover:bg-[hsl(var(--surface))] transition-colors group',
        selected && 'bg-[hsl(var(--primary)/0.06)]',
      )}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={() => {}}
        onClick={e => { e.preventDefault(); e.stopPropagation(); onToggle(doc._id, e as unknown as React.MouseEvent); }}
        className={cn('accent-primary shrink-0 transition-opacity cursor-pointer', !selected ? 'opacity-0 group-hover:opacity-100' : 'opacity-100')}
        aria-label={`Select ${doc.title}`}
      />
      <FileText className="h-4 w-4 shrink-0 text-[hsl(var(--foreground-subtle))]" aria-hidden="true" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{doc.title}</p>
        <p className="mt-0.5 font-mono text-[12px] text-[hsl(var(--foreground-muted))]">
          {metaParts.join(' · ')}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <StatusBadge status={doc.ingestionStatus} />
        <DocumentRowMenu
          doc={doc}
          currentSetId={setId}
          studySets={studySets}
          onMutated={onMutated}
        />
      </div>
      {doc.ingestionStatus === 'processing' && <DocIngestionProgress docId={doc._id} />}
    </div>
  );

  if (href) {
    return (
      <Link
        href={selected ? '#' : href}
        onClick={selected ? e => { e.preventDefault(); onToggle(doc._id, e); } : undefined}
        className="block rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring overflow-hidden"
      >
        {inner}
      </Link>
    );
  }
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={e => { if (!selected) onOpenSheet(doc); else onToggle(doc._id, e); }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpenSheet(doc);
        }
      }}
      className="block w-full text-left rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring overflow-hidden cursor-pointer"
      aria-label={`Status for ${doc.title}: ${doc.ingestionStatus}`}
    >
      {inner}
    </div>
  );
});

function XhrUploadRow({ state }: { state: UploadState }) {
  return (
    <div className="relative flex items-center gap-3 px-4 min-h-[48px] py-2.5 rounded-md bg-surface-2">
      <FileText className="h-4 w-4 shrink-0 text-[hsl(var(--foreground-muted))]" aria-hidden="true" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{state.file.name}</p>
        {state.error && <p className="font-mono text-[12px] text-[hsl(var(--danger))] mt-0.5">{state.error}</p>}
      </div>
      <span className="font-mono text-[12px] text-[hsl(var(--foreground-muted))] shrink-0">{formatBytes(state.file.size)}</span>
      <div
        className={cn(
          'absolute bottom-0 left-0 h-[2px]',
          state.status === 'error' ? 'bg-[hsl(var(--danger))]' : 'bg-[hsl(var(--primary))]'
        )}
        style={{ width: `${state.xhrProgress}%` }}
        role="progressbar"
        aria-valuenow={state.xhrProgress}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Uploading ${state.file.name}`}
      />
    </div>
  );
}

function IngestionRow({
  docId,
  fileName,
  onDone,
}: {
  docId: string;
  fileName: string;
  onDone: (docId: string) => void;
}) {
  const progress = useIngestionProgress(docId);

  useEffect(() => {
    if (progress?.percent === 100 || progress?.stage === 'complete') {
      const timer = setTimeout(() => onDone(docId), 2000);
      return () => clearTimeout(timer);
    }
  }, [progress?.percent, progress?.stage, docId, onDone]);

  useEffect(() => {
    if (progress?.stage === 'error') {
      toast.error('PDF processing failed. Please try again.');
      onDone(docId);
    }
  }, [progress?.stage, docId, onDone]);

  const displayProgress = progress ?? { stage: 'pending', percent: 0, message: 'Waiting for processing…', documentId: docId };

  return (
    <div className="relative flex items-center gap-3 px-4 min-h-[48px] py-2.5 rounded-md bg-surface-2">
      <FileText className="h-4 w-4 shrink-0 text-[hsl(var(--foreground-muted))]" aria-hidden="true" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{fileName}</p>
        <p className="font-mono text-[12px] text-[hsl(var(--foreground-muted))] mt-0.5 flex items-center gap-1.5">
          <Loader2 className="h-3 w-3 animate-spin shrink-0" aria-hidden="true" />
          {displayProgress.message}
        </p>
      </div>
      {displayProgress.percent > 0 && (
        <span className="font-mono text-[12px] text-[hsl(var(--foreground-muted))] shrink-0">{displayProgress.percent}%</span>
      )}
      {displayProgress.percent > 0 && (
        <div
          className="absolute bottom-0 left-0 h-[2px] bg-[hsl(var(--primary))]"
          style={{ width: `${displayProgress.percent}%` }}
          role="progressbar"
          aria-valuenow={displayProgress.percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Processing ${fileName}`}
        />
      )}
    </div>
  );
}

function DropZone({ onFiles }: { onFiles: (files: File[]) => void }) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const pdfs = Array.from(e.dataTransfer.files).filter(f => f.type === 'application/pdf');
    if (pdfs.length) onFiles(pdfs);
  }, [onFiles]);

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      className={cn(
        'rounded-lg border-2 border-dashed p-8 text-center transition-colors',
        dragging ? 'border-primary bg-primary-soft' : 'border-border bg-surface-2'
      )}
    >
      <Upload className="mx-auto h-8 w-8 text-foreground-subtle mb-3" aria-hidden="true" />
      <p className="text-sm text-foreground-muted mb-1">
        Drag and drop PDFs here, or{' '}
        <button
          onClick={() => inputRef.current?.click()}
          className="text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring rounded cursor-pointer"
        >
          browse
        </button>
      </p>
      <p className="text-xs text-foreground-subtle">PDF only · max 50 MB each</p>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        multiple
        className="sr-only"
        aria-label="Upload PDF files"
        onChange={e => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) onFiles(files);
          e.target.value = '';
        }}
      />
    </div>
  );
}

interface DocumentListProps {
  docs:       SynapseDocument[];
  studySetId: string;
  studySets?: StudySet[];
  setId?:     string; // alias for studySetId, used in some call sites
}

export function DocumentList({ docs, studySetId, studySets = [] }: DocumentListProps) {
  const router = useRouter();
  const [uploads, setUploads] = useState<UploadState[]>([]);
  const [localDocs, setLocalDocs] = useState<SynapseDocument[]>(docs);
  const [sheetDoc,  setSheetDoc]  = useState<SynapseDocument | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkMoveOpen,   setBulkMoveOpen]   = useState(false);
  const [bulkMoveTarget, setBulkMoveTarget] = useState('');
  const [bulkBusy,       setBulkBusy]       = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const emptyStateInputRef = useRef<HTMLInputElement>(null);
  const getId = useCallback((d: SynapseDocument) => d._id, []);
  const bulk = useBulkSelection({ items: localDocs, getId });

  // Resync when the server-rendered list changes (e.g. router.refresh()).
  useEffect(() => { setLocalDocs(docs); }, [docs]);

  // Live-refresh: when the worker emits an ingestion event for any of our
  // docs, refetch that single row and splice it into local state. Avoids
  // a full router.refresh() per event.
  useEffect(() => {
    const socket = getSocket();
    let cancelled = false;

    function handleEvent(payload: { documentId?: string; stage?: string }) {
      const docId = payload?.documentId;
      if (!docId) return;
      // Only react to docs we know about, or recent uploads.
      const known = localDocsRef.current.some(d => d._id === docId);
      if (!known) return;
      getDocument(docId)
        .then(fresh => {
          if (cancelled) return;
          setLocalDocs(prev => prev.map(d => (d._id === docId ? { ...d, ...fresh } : d)));
          // Refresh the open sheet so it reflects the new status too.
          setSheetDoc(prev => (prev && prev._id === docId ? { ...prev, ...fresh } : prev));
        })
        .catch(() => { /* non-fatal */ });
    }

    socket.on('ingestion:progress', handleEvent);
    socket.on('ingestion:failed', handleEvent);

    return () => {
      cancelled = true;
      socket.off('ingestion:progress', handleEvent);
      socket.off('ingestion:failed', handleEvent);
    };
  }, []);

  // Keep a ref so the socket handler always sees the latest list
  // without re-subscribing on every change.
  const localDocsRef = useRef(localDocs);
  useEffect(() => { localDocsRef.current = localDocs; }, [localDocs]);

  // Fallback poll every 8 s while ANY row is still in flight, in case the
  // socket fails to deliver. C.3 makes the WS path dense; this is belt-and-
  // suspenders for misconfigured environments.
  useEffect(() => {
    const inFlight = localDocs.filter(d => d.ingestionStatus === 'pending' || d.ingestionStatus === 'processing');
    if (inFlight.length === 0) return;
    const timer = setInterval(() => {
      inFlight.forEach(d => {
        getDocument(d._id)
          .then(fresh => setLocalDocs(prev => prev.map(p => (p._id === d._id ? { ...p, ...fresh } : p))))
          .catch(() => { /* non-fatal */ });
      });
    }, 8000);
    return () => clearInterval(timer);
  }, [localDocs]);

  const handleIngestionDone = useCallback((docId: string) => {
    setUploads(prev => prev.filter(u => u.docId !== docId));
    // Pull the freshly-ready doc into the live list (live socket likely
    // already did, but cover the case where the user uploaded just now).
    getDocument(docId)
      .then(fresh => setLocalDocs(prev => {
        const exists = prev.some(d => d._id === docId);
        return exists ? prev.map(d => (d._id === docId ? { ...d, ...fresh } : d)) : [fresh, ...prev];
      }))
      .catch(() => router.refresh());
  }, [router]);

  const handleRowMutation = useCallback((docId: string) => (next: SynapseDocument | null) => {
    setLocalDocs(prev => {
      if (next === null) return prev.filter(d => d._id !== docId);
      return prev.map(d => (d._id === docId ? next : d));
    });
  }, []);

  const handleToggle = useCallback((id: string, e: React.MouseEvent) => {
    bulk.toggle(id, { shift: e.shiftKey, cmd: e.metaKey || e.ctrlKey });
  }, [bulk]);

  const handleBulkDelete = useCallback(async () => {
    setBulkBusy(true);
    try {
      const ids = Array.from(bulk.selected);
      await bulkDeleteDocuments(ids);
      setLocalDocs(prev => prev.filter(d => !bulk.selected.has(d._id)));
      bulk.clear();
      setBulkDeleteOpen(false);
      toast.success(`Deleted ${ids.length} document${ids.length !== 1 ? 's' : ''}`);
    } catch {
      toast.error('Bulk delete failed');
    } finally {
      setBulkBusy(false);
    }
  }, [bulk]);

  const handleBulkMove = useCallback(async () => {
    if (!bulkMoveTarget) return;
    setBulkBusy(true);
    try {
      const ids = Array.from(bulk.selected);
      await bulkMoveDocuments(ids, bulkMoveTarget);
      setLocalDocs(prev => prev.filter(d => !bulk.selected.has(d._id)));
      bulk.clear();
      setBulkMoveOpen(false);
      setBulkMoveTarget('');
      toast.success(`Moved ${ids.length} document${ids.length !== 1 ? 's' : ''}`);
      router.refresh();
    } catch {
      toast.error('Bulk move failed');
    } finally {
      setBulkBusy(false);
    }
  }, [bulk, bulkMoveTarget, router]);

  const uploadFiles = useCallback(async (files: File[]) => {
    const newUploads: UploadState[] = files.map((f, i) => ({
      id: `${Date.now()}-${i}`,
      file: f,
      xhrProgress: 0,
      status: 'uploading',
    }));
    setUploads(prev => [...prev, ...newUploads]);

    await Promise.all(
      newUploads.map(async (upload) => {
        const body = new FormData();
        body.append('file', upload.file);
        body.append('studySetId', studySetId);

        try {
          const responseText = await new Promise<string>((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('POST', '/api/documents/upload');
            xhr.upload.onprogress = e => {
              if (e.lengthComputable) {
                const pct = Math.round((e.loaded / e.total) * 100);
                setUploads(prev => prev.map(u =>
                  u.id === upload.id ? { ...u, xhrProgress: pct } : u
                ));
              }
            };
            xhr.onload = () => {
              if (xhr.status >= 200 && xhr.status < 300) {
                resolve(xhr.responseText);
              } else {
                reject(new Error(xhr.responseText));
              }
            };
            xhr.onerror = () => reject(new Error('Network error'));
            xhr.send(body);
          });

          let docId: string | undefined;
          try {
            const doc = JSON.parse(responseText);
            docId = doc._id ?? doc.id;
          } catch {
            // server didn't return parseable JSON
          }

          setUploads(prev => prev.map(u =>
            u.id === upload.id
              ? { ...u, status: docId ? 'ingesting' : 'done', xhrProgress: 100, docId }
              : u
          ));

          if (!docId) {
            setTimeout(() => {
              setUploads(prev => prev.filter(u => u.id !== upload.id));
              router.refresh();
            }, 2000);
          }
        } catch (err) {
          setUploads(prev => prev.map(u =>
            u.id === upload.id
              ? { ...u, status: 'error', error: err instanceof Error ? err.message : 'Upload failed' }
              : u
          ));
          setTimeout(() => setUploads(prev => prev.filter(u => u.id !== upload.id)), 4000);
        }
      })
    );
  }, [studySetId, router]);

  const uploadingItems = uploads.filter(u => u.status === 'uploading' || u.status === 'error');
  const ingestingItems = uploads.filter(u => u.status === 'ingesting' && u.docId);

  const eligibleSets = studySets.filter(s => s._id !== studySetId);

  return (
    <>
      {/* Bulk delete confirmation */}
      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {bulk.count} document{bulk.count !== 1 ? 's' : ''}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete {bulk.count} document{bulk.count !== 1 ? 's' : ''} and their vector data. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              disabled={bulkBusy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk move dialog */}
      <Dialog open={bulkMoveOpen} onOpenChange={v => { if (!v) { setBulkMoveOpen(false); setBulkMoveTarget(''); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Move {bulk.count} document{bulk.count !== 1 ? 's' : ''} to set</DialogTitle>
          </DialogHeader>
          <div className="mt-4 flex flex-col gap-4">
            {eligibleSets.length === 0 ? (
              <p className="text-sm text-foreground-muted">No other study sets available.</p>
            ) : (
              <select
                value={bulkMoveTarget}
                onChange={e => setBulkMoveTarget(e.target.value)}
                autoFocus
                aria-label="Target study set"
                className="h-9 w-full rounded-md border border-border bg-surface-2 px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
              >
                <option value="" disabled>Choose a study set…</option>
                {eligibleSets.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
              </select>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setBulkMoveOpen(false); setBulkMoveTarget(''); }} disabled={bulkBusy}>Cancel</Button>
              <Button onClick={handleBulkMove} disabled={bulkBusy || !bulkMoveTarget}>Move</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <div className="flex flex-col gap-4">
        <DropZone onFiles={uploadFiles} />

        {uploadingItems.length > 0 && (
          <div className="flex flex-col gap-2" aria-live="polite" aria-label="Upload queue">
            {uploadingItems.map(u => <XhrUploadRow key={u.id} state={u} />)}
          </div>
        )}

        {ingestingItems.length > 0 && (
          <div className="flex flex-col gap-2" aria-live="polite" aria-label="Processing queue">
            {ingestingItems.map(u => (
              <IngestionRow
                key={u.docId}
                docId={u.docId!}
                fileName={u.file.name}
                onDone={handleIngestionDone}
              />
            ))}
          </div>
        )}

        {localDocs.length === 0 && uploads.length === 0 ? (
          <EmptyState
            icon={<FileText className="h-6 w-6" aria-hidden="true" />}
            headline="No PDFs in this set yet."
            subline="Upload a PDF and Synapse will index it for retrieval and flashcards."
            action={
              <>
                <input
                  ref={emptyStateInputRef}
                  type="file"
                  accept="application/pdf"
                  multiple
                  className="sr-only"
                  aria-label="Upload PDF files"
                  onChange={e => {
                    const files = Array.from(e.target.files ?? []);
                    if (files.length) void uploadFiles(files);
                    e.target.value = '';
                  }}
                />
                <Button onClick={() => emptyStateInputRef.current?.click()}>
                  <Upload className="h-4 w-4 mr-1" aria-hidden="true" />
                  Upload your first PDF
                </Button>
              </>
            }
          />
        ) : (
          <>
            {localDocs.length > 0 && (
              <div className="flex items-center gap-3 px-4 py-2">
                <input
                  type="checkbox"
                  checked={bulk.count === localDocs.length && localDocs.length > 0}
                  onChange={() => { if (bulk.count === localDocs.length) bulk.clear(); else bulk.selectAll(); }}
                  className="accent-primary cursor-pointer"
                  aria-label="Select all documents"
                />
                <span className="text-xs text-foreground-subtle">
                  {localDocs.length} document{localDocs.length !== 1 ? 's' : ''}
                  {bulk.count > 0 && ` · ${bulk.count} selected`}
                </span>
              </div>
            )}
            <div ref={listRef} className="flex flex-col gap-0.5 relative">
              {localDocs.map(doc => (
                <DocRow
                  key={doc._id}
                  doc={doc}
                  setId={studySetId}
                  studySets={studySets}
                  onMutated={handleRowMutation(doc._id)}
                  onOpenSheet={setSheetDoc}
                  selected={bulk.isSelected(doc._id)}
                  onToggle={handleToggle}
                />
              ))}
              <Marquee
                containerRef={listRef}
                onSelect={(ids, mode) => bulk.selectIds(ids, mode)}
              />
            </div>
          </>
        )}

        {sheetDoc && (
          <ProcessingSheet
            doc={sheetDoc}
            setId={studySetId}
            open={sheetDoc !== null}
            onClose={() => setSheetDoc(null)}
          />
        )}
      </div>

      <BulkActionBar
        count={bulk.count}
        onDelete={() => setBulkDeleteOpen(true)}
        onMove={studySets.length > 1 ? () => setBulkMoveOpen(true) : undefined}
        onCancel={bulk.clear}
      />
    </>
  );
}
