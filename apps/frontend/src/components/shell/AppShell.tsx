'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Menu } from 'lucide-react';
import { TopBar, type BreadcrumbItem } from './TopBar';
import { LeftSidebar } from './LeftSidebar';
import { Sheet, SheetContent } from '@/components/ui/sheet';

export type { BreadcrumbItem };
import { CreateStudySetModal } from '@/components/studyset/CreateStudySetModal';
import { SidePanel, type SidePanelMode } from './SidePanel';
import { useStagingContext } from '@/contexts/StagingContext';
import { CommandPalette } from './CommandPalette';
import { DumbModeBanner } from './DumbModeBanner';
import { MobileBottomNav } from './MobileBottomNav';
import { SearchOverlay } from '@/components/search/SearchOverlay';
import { useShortcut } from '@/hooks/useShortcut';
import { useStudySession } from '@/contexts/StudySessionContext';
import type { StudySet, ReadinessBreakdown } from '@/lib/api/study-sets';
import { deleteStudySet, archiveStudySet, getReadinessScore } from '@/lib/api/study-sets';
import type { SynapseDocument } from '@/lib/api/documents';
import { getDocuments } from '@/lib/api/documents';
import { getFeynmanSessions } from '@/lib/api/feynman';
import { cn } from '@/lib/cn';

interface AppShellProps {
  children: React.ReactNode;
  breadcrumb?: BreadcrumbItem[];
  studySetName?: string;
  hideSidePanel?: boolean;
  studySets?: StudySet[];
}

export function AppShell({ children, breadcrumb, studySetName, hideSidePanel, studySets }: AppShellProps) {
  const [sidebarOpen, setSidebarOpen]               = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen]   = useState(false);
  const [sidePanelOpen, setSidePanelOpen]           = useState(false);
  const [sidePanelMode, setSidePanelMode]           = useState<SidePanelMode>('coach');
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [searchOpen, setSearchOpen]                 = useState(false);
  const [createSetOpen, setCreateSetOpen]           = useState(false);
  const [isMobile, setIsMobile]                     = useState(false);
  const [deletedSetIds, setDeletedSetIds]           = useState<Set<string>>(new Set());
  const [elapsedMinutes, setElapsedMinutes]         = useState(0);
  const [readinessScore, setReadinessScore]         = useState<number | null>(null);
  const [readinessBreakdown, setReadinessBreakdown] = useState<ReadinessBreakdown | null>(null);
  const [documents, setDocuments]                   = useState<SynapseDocument[]>([]);
  const [lastFeynmanScore, setLastFeynmanScore]     = useState<number | null>(null);

  const { session } = useStudySession();
  const pathname = usePathname();
  const staging = useStagingContext();

  // Auto-open SidePanel + switch tab whenever something stages, per UX_v3 §6.9.
  // Registered with the StagingContext at mount; replaced by the next AppShell
  // mount if the user navigates (the provider lives above us).
  useEffect(() => {
    const hint = (mode: 'cards' | 'cornell' | 'coach') => {
      if (hideSidePanel) return;
      setSidePanelOpen(true);
      setSidePanelMode(mode);
    };
    staging.setOnStageHint(hint);
    return () => staging.setOnStageHint(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hideSidePanel]);

  // Extract studySetId from /sets/[setId]/... routes
  const pathnameSetId = useMemo(() => {
    const m = pathname.match(/^\/sets\/([^/]+)/);
    return m ? m[1] : null;
  }, [pathname]);

  useEffect(() => {
    if (!session.startedAt) { setElapsedMinutes(0); return; }
    const interval = setInterval(() => {
      setElapsedMinutes(Math.floor((Date.now() - session.startedAt!.getTime()) / 60000));
    }, 60000);
    return () => clearInterval(interval);
  }, [session.startedAt]);

  useEffect(() => {
    if (!pathnameSetId) {
      setReadinessScore(null);
      setReadinessBreakdown(null);
      return;
    }
    let cancelled = false;
    const fetch = () => {
      getReadinessScore(pathnameSetId)
        .then(data => {
          if (!cancelled) {
            setReadinessScore(data.score);
            setReadinessBreakdown(data.breakdown);
          }
        })
        .catch(() => {/* ignore — pill stays hidden on error */});
    };
    fetch();
    const interval = setInterval(fetch, 60_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [pathnameSetId]);

  // Fetch documents + last Feynman score whenever the active set changes
  useEffect(() => {
    if (!pathnameSetId) {
      setDocuments([]);
      setLastFeynmanScore(null);
      return;
    }
    let cancelled = false;
    Promise.allSettled([
      getDocuments(pathnameSetId),
      getFeynmanSessions(pathnameSetId),
    ]).then(([docsRes, sessionsRes]) => {
      if (cancelled) return;
      if (docsRes.status === 'fulfilled') setDocuments(docsRes.value);
      if (sessionsRes.status === 'fulfilled') {
        const scored = sessionsRes.value
          .filter(s => s.clarityScore != null && s.status === 'complete')
          .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
        setLastFeynmanScore(scored[0]?.clarityScore ?? null);
      }
    });
    return () => { cancelled = true; };
  }, [pathnameSetId]);

  const router = useRouter();

  const visibleStudySets = useMemo(
    () => studySets?.filter(s => !deletedSetIds.has(s._id)),
    [studySets, deletedSetIds]
  );

  const handleDeleteStudySet = useCallback(async (setId: string) => {
    // Optimistic: hide from sidebar immediately
    setDeletedSetIds(prev => new Set([...prev, setId]));
    try {
      await deleteStudySet(setId);
      // Navigate first to avoid 404 flash on the deleted set's route
      router.push('/');
      router.refresh();
    } catch {
      // Rollback optimistic update on failure
      setDeletedSetIds(prev => {
        const next = new Set(prev);
        next.delete(setId);
        return next;
      });
    }
  }, [router]);

  const handleArchiveStudySet = useCallback(async (setId: string, archive: boolean) => {
    try {
      await archiveStudySet(setId, archive);
      if (archive) router.push('/sets');
      router.refresh();
    } catch {
      // ignore — sidebar will remain unchanged until next refresh
    }
  }, [router]);

  const handleUpload = useCallback(() => {
    if (!pathnameSetId) return;
    // Navigate to the set page where the DocumentList upload drop zone lives
    router.push(`/sets/${pathnameSetId}`);
  }, [router, pathnameSetId]);

  const handleNewNote = useCallback(() => {
    if (!pathnameSetId) return;
    router.push(`/sets/${pathnameSetId}/notes/new`);
  }, [router, pathnameSetId]);

  // Detect mobile after mount to avoid SSR mismatch
  useEffect(() => {
    const check = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (mobile) setSidebarOpen(false);
    };
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const toggleSidebar = useCallback(() => setSidebarOpen(v => !v), []);

  const openCoach = useCallback(() => {
    if (!hideSidePanel) {
      setSidePanelOpen(true);
      setSidePanelMode('coach');
    }
  }, [hideSidePanel]);

  const toggleSidePanel = useCallback(() => {
    if (hideSidePanel) return;
    setSidePanelOpen(v => !v);
    setSidePanelMode('coach');
  }, [hideSidePanel]);

  // Global keyboard shortcuts (Cmd on Mac, Ctrl on Windows/Linux)
  useShortcut('meta+b', toggleSidebar);
  useShortcut('meta+.', toggleSidePanel);
  useShortcut('meta+k', () => setCommandPaletteOpen(true));
  useShortcut('meta+/', () => setSearchOpen(true));
  useShortcut('meta+shift+f', () => router.push('/search'));

  const currentStudySet = useMemo(
    () => pathnameSetId ? visibleStudySets?.find(s => s._id === pathnameSetId) : undefined,
    [pathnameSetId, visibleStudySets]
  );
  const currentStudySetId = currentStudySet?._id;

  return (
    <div className="flex flex-col h-[100dvh] overflow-hidden bg-background">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:px-4 focus:py-2 focus:bg-[hsl(var(--surface))] focus:border focus:border-[hsl(var(--border))] focus:rounded-[var(--radius-md)] focus:text-sm focus:font-medium focus:shadow-[var(--shadow-md)]"
      >
        Skip to main content
      </a>
      <CreateStudySetModal open={createSetOpen} onClose={() => setCreateSetOpen(false)} />

      <TopBar
        sidebarOpen={sidebarOpen}
        onSidebarToggle={toggleSidebar}
        onCommandPaletteOpen={() => setCommandPaletteOpen(true)}
        onSearchOpen={() => setSearchOpen(true)}
        onCoachOpen={hideSidePanel ? undefined : openCoach}
        sidePanelOpen={sidePanelOpen}
        breadcrumb={breadcrumb}
        studyingElapsed={session.startedAt ? elapsedMinutes : null}
        readinessScore={readinessScore}
        readinessBreakdown={readinessBreakdown}
      />

      <DumbModeBanner />

      {/* Body — sidebar + main + right panel as CSS flex (no percentage panels) */}
      <div className="flex flex-1 overflow-hidden">

        {/* Mobile hamburger button — only visible below md */}
        <button
          className="md:hidden fixed top-2.5 left-2.5 z-20 flex items-center justify-center w-11 h-11"
          onClick={() => setMobileSidebarOpen(true)}
          aria-label="Open navigation"
        >
          <Menu size={20} aria-hidden="true" />
        </button>

        {/* Mobile sidebar drawer — Radix Sheet, handles focus trap + Escape */}
        <Sheet open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
          <SheetContent side="left" className="p-0 w-[240px]">
            <LeftSidebar
              open={true}
              onCommandPaletteOpen={() => { setCommandPaletteOpen(true); setMobileSidebarOpen(false); }}
              onNewStudySet={() => { setCreateSetOpen(true); setMobileSidebarOpen(false); }}
              studySets={visibleStudySets}
              onDeleteStudySet={handleDeleteStudySet}
              onArchiveStudySet={handleArchiveStudySet}
              onNavigate={() => setMobileSidebarOpen(false)}
              studySet={currentStudySet}
              documents={documents}
              lastFeynmanScore={lastFeynmanScore}
              onUpload={handleUpload}
              onNewNote={handleNewNote}
            />
          </SheetContent>
        </Sheet>

        {/* Desktop sidebar — hidden on mobile (md:flex)
            Outer width snaps instantly (no Layout passes during animation per
            UX_v3 §1.4); inner content slides via transform + opacity. */}
        <aside
          id="left-sidebar-wrapper"
          data-collapsed={!sidebarOpen}
          className={cn(
            'hidden md:flex flex-none overflow-hidden',
            sidebarOpen ? 'w-60' : 'w-0'
          )}
        >
          <div
            className={cn(
              'w-60 h-full transition-[transform,opacity] duration-200 ease-out will-change-transform',
              sidebarOpen ? 'translate-x-0 opacity-100' : '-translate-x-full opacity-0'
            )}
          >
            <LeftSidebar
              open={true}
              onCommandPaletteOpen={() => setCommandPaletteOpen(true)}
              onNewStudySet={() => setCreateSetOpen(true)}
              studySets={visibleStudySets}
              onDeleteStudySet={handleDeleteStudySet}
              onArchiveStudySet={handleArchiveStudySet}
              studySet={currentStudySet}
              documents={documents}
              lastFeynmanScore={lastFeynmanScore}
              onUpload={handleUpload}
              onNewNote={handleNewNote}
            />
          </div>
        </aside>

        {/* Main canvas */}
        <main
          id="main-content"
          role="main"
          className="flex-1 min-w-0 h-full overflow-y-auto pb-14 md:pb-0"
          tabIndex={-1}
        >
          {children}
        </main>

        {/* Right SidePanel — fixed 320 px when open.
            Instant width snap; inner transform/opacity for visual transition. */}
        {!hideSidePanel && (
          <aside
            aria-label="Study panel"
            data-collapsed={!sidePanelOpen}
            className={cn(
              'flex-none overflow-hidden',
              sidePanelOpen ? 'w-80' : 'w-0'
            )}
          >
            <div
              className={cn(
                'w-80 h-full transition-[transform,opacity] duration-200 ease-out will-change-transform',
                sidePanelOpen ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'
              )}
            >
              <SidePanel
                open={sidePanelOpen}
                onClose={() => setSidePanelOpen(false)}
                studySetId={currentStudySetId}
                studySetName={studySetName}
                requestedMode={sidePanelMode}
              />
            </div>
          </aside>
        )}
      </div>

      <CommandPalette
        open={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        currentStudySetId={currentStudySetId}
        onOpenCoach={openCoach}
        studySets={visibleStudySets}
        onNewStudySet={() => { setCommandPaletteOpen(false); setCreateSetOpen(true); }}
      />

      <SearchOverlay
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        studySets={visibleStudySets}
      />

      <MobileBottomNav onCommandPaletteOpen={() => setCommandPaletteOpen(true)} />
    </div>
  );
}
