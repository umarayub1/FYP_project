'use client';

import '@/lib/pdfjs-worker';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Document, Page } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { Panel, Group as PanelGroup, Separator as PanelResizeHandle } from 'react-resizable-panels';
import { PDFOutlinePane, type PDFOutlineItem } from './PDFOutlinePane';
import { PDFToolbar } from './PDFToolbar';
import { PDFFindBar } from './PDFFindBar';
import { UniversalContextMenu, type UniversalMenuAction } from '@/components/staging/UniversalContextMenu';
import { useStagingContext } from '@/contexts/StagingContext';
import { PDFAnnotationLayer, type Annotation } from './PDFAnnotationLayer';
import { ComprehensionCheckpointOverlay } from './ComprehensionCheckpointOverlay';
import { Skeleton } from '@/components/ui/skeleton';
import { usePlatform } from '@/hooks/usePlatform';
import { useStudySession } from '@/contexts/StudySessionContext';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/cn';
import { toast } from 'sonner';
import { createNote, updateNote } from '@/lib/api/notes';

export interface Checkpoint {
  page: number;
  scrollY: number;
  savedAt: string;
}

const AVG_WORDS_PER_PAGE = 300;
const READING_SPEED_WPM = 200;

interface PDFReaderProps {
  src: string;
  documentId: string;
  studySetId: string;
  documentTitle?: string;
  annotations?: Annotation[];
  initialPage?: number;
  highlightPage?: boolean;
  onStageSelection?: (text: string, page: number, mode: 'cards' | 'cornell' | 'coach') => void;
}

export function PDFReader({
  src,
  documentId,
  studySetId,
  documentTitle = 'Document',
  annotations = [],
  initialPage = 1,
  highlightPage = false,
  onStageSelection,
}: PDFReaderProps) {
  const { startSession, endSession } = useStudySession();
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    startSession('document', studySetId);
    return () => { endSession(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [scale, setScale] = useState(1.0);
  const [outline, setOutline] = useState<PDFOutlineItem[]>([]);
  const [outlineOpen, setOutlineOpen] = useState(true);
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState('');
  const [matchCount, setMatchCount] = useState(0);
  const [currentMatch, setCurrentMatch] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [citationHighlight, setCitationHighlight] = useState(highlightPage);
  const [selectionMenu, setSelectionMenu] = useState<{ rect: DOMRect; text: string } | null>(null);
  const [selectionPage, setSelectionPage] = useState(1);
  const staging = useStagingContext();
  const [eyeComfortMode, setEyeComfortMode] = useState(false);
  const [comprehensionEnabled, setComprehensionEnabled] = useState(false);
  const [comprehensionInterval, setComprehensionInterval] = useState(5);
  const [completedCheckpointPages, setCompletedCheckpointPages] = useState<Set<number>>(new Set());
  const [activeCheckpointPage, setActiveCheckpointPage] = useState<number | null>(null);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const platform = usePlatform();

  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const hasShownResumeToast = useRef(false);

  // Fetch preferences on mount for eye comfort mode + comprehension settings
  useEffect(() => {
    fetch('/api/user/preferences', { credentials: 'include' })
      .then(r => r.ok ? r.json() : {})
      .then((prefs: {
        pdfDarkInvert?:            boolean;
        comprehensionCheckpoints?: boolean;
        comprehensionInterval?:    number;
      }) => {
        if (prefs.pdfDarkInvert) setEyeComfortMode(true);
        if (prefs.comprehensionCheckpoints) setComprehensionEnabled(true);
        if (typeof prefs.comprehensionInterval === 'number' && prefs.comprehensionInterval > 0) {
          setComprehensionInterval(prefs.comprehensionInterval);
        }
      })
      .catch(() => {});
  }, []);

  // Fetch the list of pages where this user has already completed a comprehension
  // check so we don't re-trigger when they revisit.
  useEffect(() => {
    fetch(`/api/pdfs/${documentId}/comprehension`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then((checks: { page: number }[]) => {
        if (Array.isArray(checks)) {
          setCompletedCheckpointPages(new Set(checks.map(c => c.page)));
        }
      })
      .catch(() => {});
  }, [documentId]);

  // Trigger the overlay when the user crosses a checkpoint page that hasn't
  // been completed yet. Multiples of comprehensionInterval, e.g. 5/10/15…
  useEffect(() => {
    if (!comprehensionEnabled) return;
    if (activeCheckpointPage !== null) return;
    if (currentPage < comprehensionInterval) return;
    if (currentPage % comprehensionInterval !== 0) return;
    if (completedCheckpointPages.has(currentPage)) return;
    setActiveCheckpointPage(currentPage);
  }, [
    currentPage,
    comprehensionEnabled,
    comprehensionInterval,
    completedCheckpointPages,
    activeCheckpointPage,
  ]);

  // Auto-remove citation highlight after 1.5s
  useEffect(() => {
    if (citationHighlight) {
      const t = setTimeout(() => setCitationHighlight(false), 1500);
      return () => clearTimeout(t);
    }
  }, [citationHighlight]);

  // Fetch existing checkpoints on mount
  useEffect(() => {
    fetch(`/api/pdfs/${documentId}/checkpoints`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then((data: Checkpoint[]) => setCheckpoints(data))
      .catch(() => {});
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [documentId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Resume toast — show once when checkpoints first load
  useEffect(() => {
    if (checkpoints.length > 0 && !hasShownResumeToast.current) {
      hasShownResumeToast.current = true;
      const last = checkpoints[checkpoints.length - 1];
      toast('Resume reading?', {
        description: `You were on page ${last.page}`,
        action: {
          label: 'Resume',
          onClick: () => scrollToPage(last.page),
        },
        cancel: {
          label: 'Start from beginning',
          onClick: () => {},
        },
        duration: 8000,
      });
    }
  }, [checkpoints]); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounce-save checkpoint on page change
  useEffect(() => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(async () => {
      const scrollY = scrollContainerRef.current?.scrollTop ?? 0;
      try {
        const res = await fetch(`/api/pdfs/${documentId}/checkpoints`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ page: currentPage, scrollY }),
        });
        if (res.ok) {
          const saved: Checkpoint = await res.json();
          setCheckpoints(prev => [...prev, saved].slice(-10));
        }
      } catch {
        // fire-and-forget
      }
    }, 2000);
  }, [currentPage]); // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll observer to update current page
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    function onScroll() {
      const containerTop = container!.getBoundingClientRect().top;
      let best = 1;
      let bestDist = Infinity;
      pageRefs.current.forEach((el, page) => {
        const rect = el.getBoundingClientRect();
        const dist = Math.abs(rect.top - containerTop);
        if (dist < bestDist) { bestDist = dist; best = page; }
      });
      setCurrentPage(best);
    }

    container.addEventListener('scroll', onScroll, { passive: true });
    return () => container.removeEventListener('scroll', onScroll);
  }, [numPages]);

  // Scroll to initial page
  useEffect(() => {
    if (initialPage > 1) {
      setTimeout(() => scrollToPage(initialPage), 300);
    }
  }, [initialPage]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard shortcuts
  useEffect(() => {
    const mod = platform === 'mac' ? 'metaKey' : 'ctrlKey';

    function handler(e: KeyboardEvent) {
      const isModDown = e[mod as keyof KeyboardEvent] as boolean;

      if (isModDown && e.key === '1') { e.preventDefault(); setOutlineOpen(v => !v); }
      if (isModDown && (e.key === '+' || e.key === '=')) { e.preventDefault(); setScale(s => Math.min(s + 0.25, 3)); }
      if (isModDown && e.key === '-') { e.preventDefault(); setScale(s => Math.max(s - 0.25, 0.5)); }
      if (isModDown && e.key === '0') { e.preventDefault(); handleFitWidth(); }
      if (isModDown && e.key.toLowerCase() === 'f') { e.preventDefault(); setFindOpen(v => !v); }
      if (e.key === 'PageUp')  { e.preventDefault(); scrollToPage(Math.max(currentPage - 1, 1)); }
      if (e.key === 'PageDown') { e.preventDefault(); scrollToPage(Math.min(currentPage + 1, numPages)); }
      if (e.key === 'Home') { e.preventDefault(); scrollToPage(1); }
      if (e.key === 'End')  { e.preventDefault(); scrollToPage(numPages); }
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [platform, currentPage, numPages]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reading time remaining
  const readingTimeRemaining = useMemo(() => {
    if (numPages === 0) return 0;
    const pagesLeft = numPages - currentPage + 1;
    return Math.ceil((pagesLeft * AVG_WORDS_PER_PAGE) / READING_SPEED_WPM);
  }, [numPages, currentPage]);

  // Canvas filter style for dark/eye-comfort mode
  const canvasFilter = useMemo(() => {
    if (eyeComfortMode) return 'invert(0.85) hue-rotate(180deg)';
    if (resolvedTheme === 'dark') return 'brightness(0.88)';
    return undefined;
  }, [eyeComfortMode, resolvedTheme]);

  function scrollToPage(page: number) {
    const el = pageRefs.current.get(page);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setCurrentPage(page);
  }

  function handleFitWidth() {
    if (scrollContainerRef.current) {
      const containerW = scrollContainerRef.current.clientWidth - 48;
      const naturalW = 612;
      setScale(containerW / naturalW);
    }
  }

  function handleFitPage() {
    if (scrollContainerRef.current) {
      const containerH = scrollContainerRef.current.clientHeight - 32;
      const naturalH = 792;
      setScale(containerH / naturalH);
    }
  }

  function handleDocumentLoadSuccess({ numPages: n }: { numPages: number }) {
    setNumPages(n);
  }

  async function handleDocumentLoadOutline(proxy: Parameters<NonNullable<Parameters<typeof Document>[0]['onLoadSuccess']>>[0]) {
    try {
      const raw = await proxy.getOutline();
      if (!raw) return;

      async function resolveItems(items: Awaited<ReturnType<typeof proxy.getOutline>>): Promise<PDFOutlineItem[]> {
        if (!items) return [];
        return Promise.all(items.map(async (item) => {
          let pageNumber: number | undefined;
          try {
            if (item.dest) {
              const dest = typeof item.dest === 'string'
                ? await proxy.getDestination(item.dest)
                : item.dest;
              if (dest && Array.isArray(dest) && dest[0]) {
                const pageIdx = await proxy.getPageIndex(dest[0] as Parameters<typeof proxy.getPageIndex>[0]);
                pageNumber = pageIdx + 1;
              }
            }
          } catch { /* ignore */ }
          return {
            title: item.title,
            dest: item.dest as string | unknown[] | undefined,
            pageNumber,
            items: await resolveItems(item.items as Awaited<ReturnType<typeof proxy.getOutline>>),
          };
        }));
      }

      const resolved = await resolveItems(raw);
      setOutline(resolved);
    } catch { /* no outline */ }
  }

  function handleLoadError(err: Error) {
    setError(err.message);
  }

  function handleMouseUp(_e: React.MouseEvent, pageNumber: number) {
    // Defer to let the browser finalize the selection.
    setTimeout(() => {
      const selection = window.getSelection();
      const text = selection?.toString().trim() ?? '';
      if (text.length > 3 && selection && selection.rangeCount > 0) {
        const rect = selection.getRangeAt(0).getBoundingClientRect();
        setSelectionPage(pageNumber);
        setSelectionMenu({ rect, text });
      } else {
        setSelectionMenu(null);
      }
    }, 0);
  }

  function handleUniversalAction(action: UniversalMenuAction, text: string) {
    if (!text.trim()) return;
    const payload = { text, studySetId, sourceTitle: documentTitle, sourcePage: selectionPage };
    if (action === 'stage-card')         staging.stage('card', payload);
    else if (action === 'stage-cornell') staging.stage('cornell-row', payload);
    else if (action === 'stage-coach')   { staging.pushCoachInput(text); staging.onStageHint?.('coach'); }
    else if (action === 'define')        { staging.pushCoachInput(`Define: ${text}`); staging.onStageHint?.('coach'); }
    else if (action === 'explain')       { staging.pushCoachInput(`Explain: ${text}`); staging.onStageHint?.('coach'); }
    else if (action === 'quote-link')    staging.stage('cornell-row', payload);
    // Legacy adapter — keep the optional parent-supplied callback firing for
    // existing consumers (Phase 16 stage callback). Maps to the closest mode.
    if (action === 'stage-card')         onStageSelection?.(text, selectionPage, 'cards');
    else if (action === 'stage-cornell') onStageSelection?.(text, selectionPage, 'cornell');
    else if (action === 'stage-coach')   onStageSelection?.(text, selectionPage, 'coach');
  }

  function toggleEyeComfort() {
    const next = !eyeComfortMode;
    setEyeComfortMode(next);
    fetch('/api/user/preferences', {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pdfDarkInvert: next }),
    }).catch(() => {});
  }

  async function handleExportToCornell() {
    if (annotations.length === 0) return;
    try {
      const noteTitle = `Highlights from ${documentTitle}`;

      // Build BlockNote paragraph blocks for each annotation
      const notesBlocks = annotations.map(ann => ({
        type: 'paragraph',
        content: [{ type: 'text', text: ann.text, styles: {} }],
      }));

      // Build cue blocks (page references)
      const cueBlocks = annotations.map(ann => ({
        type: 'paragraph',
        content: [{ type: 'text', text: `p.${ann.pageNumber}`, styles: {} }],
      }));

      const note = await createNote(studySetId, noteTitle);
      await updateNote(note._id, studySetId, {
        isCornell: true,
        content: notesBlocks,
        cornellCue: cueBlocks,
      });

      toast.success('Cornell note created', {
        description: `${annotations.length} highlight${annotations.length !== 1 ? 's' : ''} exported.`,
        action: {
          label: 'Open note',
          onClick: () => {
            window.location.href = `/sets/${studySetId}/notes/${note._id}`;
          },
        },
      });
    } catch {
      toast.error('Export failed', { description: 'Could not create Cornell note.' });
    }
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-center p-8">
        <p className="text-sm text-foreground-muted">Couldn&apos;t render this page.</p>
        <div className="flex gap-2">
          <button onClick={() => setError(null)} className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-surface-2 cursor-pointer">
            Try again
          </button>
          <a href={src} target="_blank" rel="noopener noreferrer" className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-surface-2">
            Open original
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full relative">
      {findOpen && (
        <PDFFindBar
          onSearch={setFindQuery}
          onCycleMatch={dir => setCurrentMatch(m => dir === 'next' ? Math.min(m + 1, matchCount) : Math.max(m - 1, 1))}
          onClose={() => { setFindOpen(false); setFindQuery(''); }}
          matchCount={matchCount}
          currentMatch={currentMatch}
        />
      )}

      <PanelGroup orientation="horizontal" className="flex-1 overflow-hidden">
        {/* Outline pane */}
        {outlineOpen && (
          <>
            <Panel defaultSize={18} minSize={12} maxSize={30} className="border-r border-border bg-surface">
              <PDFOutlinePane
                outline={outline}
                currentPage={currentPage}
                numPages={numPages}
                onJumpToPage={scrollToPage}
              />
            </Panel>
            <PanelResizeHandle className="w-1 bg-border hover:bg-primary/40 transition-colors cursor-ew-resize focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring" />
          </>
        )}

        {/* PDF pages */}
        <Panel>
          <div
            ref={scrollContainerRef}
            className="h-full overflow-y-auto px-6 py-4 bg-surface-2"
          >
            <Document
              file={src}
              onLoadSuccess={(proxy) => {
                handleDocumentLoadSuccess(proxy);
                void handleDocumentLoadOutline(proxy);
              }}
              onLoadError={handleLoadError}
              loading={
                <div className="space-y-4">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-[842px] w-[595px] mx-auto rounded-lg" />
                  ))}
                </div>
              }
              error={<p className="text-sm text-foreground-muted text-center py-8">Failed to load PDF.</p>}
            >
              {Array.from({ length: numPages }).map((_, i) => {
                const pageNum = i + 1;
                return (
                  <div key={pageNum}>
                    <div
                      ref={el => { if (el) pageRefs.current.set(pageNum, el); }}
                      className={cn(
                        'relative mx-auto mb-4 shadow-md rounded transition-all',
                        pageNum === initialPage && citationHighlight && 'animate-pulse ring-2 ring-warning'
                      )}
                      style={{ filter: canvasFilter }}
                      onMouseUp={e => handleMouseUp(e, pageNum)}
                    >
                      <Page
                        pageNumber={pageNum}
                        scale={scale}
                        renderTextLayer={true}
                        renderAnnotationLayer={false}
                        customTextRenderer={findQuery ? ({ str }) => {
                          if (!findQuery) return str;
                          const idx = str.toLowerCase().indexOf(findQuery.toLowerCase());
                          if (idx === -1) return str;
                          return `${str.slice(0, idx)}<mark class="bg-warning/40">${str.slice(idx, idx + findQuery.length)}</mark>${str.slice(idx + findQuery.length)}`;
                        } : undefined}
                      />
                      <PDFAnnotationLayer
                        annotations={annotations}
                        pageNumber={pageNum}
                        pageWidth={scale * 595}
                        pageHeight={scale * 842}
                        studySetId={studySetId}
                      />
                    </div>
                  </div>
                );
              })}
            </Document>
          </div>
        </Panel>
      </PanelGroup>

      <PDFToolbar
        currentPage={currentPage}
        numPages={numPages}
        scale={scale}
        onPageChange={scrollToPage}
        onZoom={delta => setScale(s => Math.min(Math.max(s + delta, 0.5), 3))}
        onFitWidth={handleFitWidth}
        onFitPage={handleFitPage}
        checkpoints={checkpoints}
        readingTimeRemaining={readingTimeRemaining}
        annotationCount={annotations.length}
        eyeComfortMode={eyeComfortMode}
        onToggleEyeComfort={toggleEyeComfort}
        comprehensionEnabled={comprehensionEnabled}
        onToggleComprehension={() => setComprehensionEnabled(v => !v)}
        onExportToCornell={handleExportToCornell}
      />

      {/* Universal selection menu — replaces the legacy PDFSelectionMenu */}
      <UniversalContextMenu
        open={Boolean(selectionMenu)}
        rect={selectionMenu?.rect ?? null}
        text={selectionMenu?.text ?? ''}
        variant="pdf"
        onAction={handleUniversalAction}
        onDismiss={() => setSelectionMenu(null)}
      />


      {/* Comprehension checkpoint */}
      {activeCheckpointPage !== null && (
        <ComprehensionCheckpointOverlay
          documentId={documentId}
          page={activeCheckpointPage}
          open
          onComplete={() => {
            setCompletedCheckpointPages(prev => {
              const next = new Set(prev);
              if (activeCheckpointPage !== null) next.add(activeCheckpointPage);
              return next;
            });
            setActiveCheckpointPage(null);
          }}
        />
      )}
    </div>
  );
}
