'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Home, BookOpen, FileText, AlertCircle, Settings, Search,
  ChevronLeft, LayoutDashboard, MessageCircle, MoreHorizontal, Calendar, Lightbulb,
  type LucideIcon,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/cn';
import { useAuthStore } from '@/store/auth';
import { useModKey } from '@/hooks/usePlatform';
import { useFirstTimeHint } from '@/hooks/useFirstTimeHint';
import { FirstTimeHint } from '@/components/patterns/FirstTimeHint';
import type { StudySet } from '@/lib/api/study-sets';
import type { SynapseDocument } from '@/lib/api/documents';

interface LeftSidebarProps {
  open: boolean;
  onCommandPaletteOpen: () => void;
  onNewStudySet: () => void;
  studySets?: StudySet[];
  onDeleteStudySet?: (setId: string) => Promise<void>;
  onArchiveStudySet?: (setId: string, archive: boolean) => Promise<void>;
  onNavigate?: () => void;
  // Mode B props
  studySet?: StudySet;
  documents?: SynapseDocument[];
  lastFeynmanScore?: number | null;
  onUpload?: () => void;
  onNewNote?: () => void;
}

// Item spec: height 30px, padding 0 12px, icon 14px, gap 8px
// Active: bg-surface-2 text-foreground font-medium; Hover: bg-surface, 80ms
function NavItem({
  href,
  icon: Icon,
  label,
  onNavigate,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const isActive = pathname === href || pathname.startsWith(href + '/');

  return (
    <Link
      href={href}
      aria-current={isActive ? 'page' : undefined}
      onClick={onNavigate}
      className={cn(
        'flex items-center gap-2 px-3 h-[30px] text-[13px] rounded-sm',
        'transition-colors duration-75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
        isActive
          ? 'bg-[hsl(var(--surface-2))] text-foreground font-medium'
          : 'text-[hsl(var(--foreground-muted))] hover:bg-[hsl(var(--surface))] hover:text-foreground'
      )}
    >
      <Icon size={14} aria-hidden="true" className="shrink-0" />
      <span className="truncate">{label}</span>
    </Link>
  );
}

function SetItem({
  set,
  onNavigate,
}: {
  set: StudySet;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const isActive = pathname.startsWith(`/sets/${set._id}`);

  return (
    <Link
      href={`/sets/${set._id}`}
      aria-current={isActive ? 'page' : undefined}
      onClick={onNavigate}
      className={cn(
        'flex items-center gap-2 px-3 h-[30px] text-[13px] rounded-sm',
        'transition-colors duration-75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
        isActive
          ? 'bg-[hsl(var(--surface-2))] text-foreground font-medium'
          : 'text-foreground hover:bg-[hsl(var(--surface))]'
      )}
    >
      {/* 8px colored dot */}
      <span
        className="shrink-0 rounded-full"
        style={{ width: 8, height: 8, backgroundColor: set.color }}
        aria-hidden="true"
      />
      {/* Name */}
      <span className="truncate flex-1 min-w-0">{set.name}</span>
      {/* Badge */}
      {set.dueCount !== undefined && (
        set.dueCount > 0 ? (
          <span
            className="font-mono text-[10px] leading-none text-white bg-[hsl(var(--danger))] rounded-full px-1.5 py-0.5 shrink-0"
            aria-label={`${set.dueCount} due`}
          >
            {set.dueCount}
          </span>
        ) : (
          <span
            className="text-[10px] text-[hsl(var(--success))] shrink-0"
            aria-label="Up to date"
          >
            ✓
          </span>
        )
      )}
    </Link>
  );
}

function ArchivedSetItem({
  set,
  onUnarchive,
  onNavigate,
}: {
  set: StudySet;
  onUnarchive: () => void;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const isActive = pathname.startsWith(`/sets/${set._id}`);

  return (
    <div className="flex items-center opacity-60 group/archived">
      <Link
        href={`/sets/${set._id}`}
        aria-current={isActive ? 'page' : undefined}
        onClick={onNavigate}
        className={cn(
          'flex items-center gap-2 pl-3 pr-1 h-[30px] text-[13px] rounded-sm flex-1 min-w-0',
          'transition-colors duration-75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
          isActive
            ? 'bg-[hsl(var(--surface-2))] text-foreground font-medium'
            : 'text-foreground hover:bg-[hsl(var(--surface))]'
        )}
      >
        <span
          className="shrink-0 rounded-full"
          style={{ width: 8, height: 8, backgroundColor: set.color }}
          aria-hidden="true"
        />
        <span className="truncate flex-1 min-w-0">{set.name}</span>
      </Link>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="opacity-0 group-hover/archived:opacity-100 flex items-center justify-center w-5 h-5 mr-1 rounded hover:bg-[hsl(var(--surface-2))] transition-all duration-75 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus-ring"
            aria-label={`Options for ${set.name}`}
          >
            <MoreHorizontal size={12} aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem onSelect={onUnarchive}>Unarchive</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function Divider() {
  return (
    <div
      className="h-px shrink-0 bg-[hsl(var(--border))]"
      aria-hidden="true"
    />
  );
}

function ModeBNavItem({
  href,
  icon: Icon,
  label,
  badge,
  badgeVariant = 'danger',
  exact = false,
  neverActive = false,
  onNavigate,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  badge?: string;
  badgeVariant?: 'danger' | 'warning';
  exact?: boolean;
  neverActive?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const hrefPath = href.split('?')[0];
  const isActive = !neverActive && (exact
    ? pathname === hrefPath
    : pathname === hrefPath || pathname.startsWith(hrefPath + '/'));

  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={isActive ? 'page' : undefined}
      className={cn(
        'flex items-center gap-2 px-3 h-[30px] text-[13px] rounded-sm',
        'transition-colors duration-75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
        isActive
          ? 'bg-[hsl(var(--surface-2))] text-foreground font-medium'
          : 'text-[hsl(var(--foreground-muted))] hover:bg-[hsl(var(--surface))] hover:text-foreground'
      )}
    >
      <Icon size={14} aria-hidden="true" className="shrink-0" />
      <span className="truncate flex-1 min-w-0">{label}</span>
      {badge && (
        <span
          className={cn(
            'font-mono text-[10px] leading-none rounded-full px-1.5 py-0.5 shrink-0',
            badgeVariant === 'danger'
              ? 'text-white bg-[hsl(var(--danger))]'
              : 'text-white bg-[hsl(var(--warning))]'
          )}
        >
          {badge}
        </span>
      )}
    </Link>
  );
}

export function LeftSidebar({
  open: _open,
  onCommandPaletteOpen,
  onNewStudySet,
  studySets,
  onDeleteStudySet,
  onArchiveStudySet,
  onNavigate,
  studySet,
  documents,
  lastFeynmanScore,
  onUpload,
  onNewNote,
}: LeftSidebarProps) {
  const { user } = useAuthStore();
  const mod = useModKey();
  const pathname = usePathname();
  const initials = user?.email?.[0]?.toUpperCase() ?? 'U';
  const [showArchived, setShowArchived] = useState(false);

  const allSets = studySets ?? [];
  const activeSets = allSets.filter(s => !s.archived);
  const archivedSets = allSets.filter(s => s.archived);
  const { shouldShow: showSidebarSetsHint } = useFirstTimeHint('hint:sidebar-sets');

  // Mode B: any /sets/[setId] or subpath (not just /sets)
  const isModeB = useMemo(() => {
    const parts = pathname.split('/').filter(Boolean);
    return parts[0] === 'sets' && parts.length >= 2;
  }, [pathname]);

  // setId for building Mode B links (from studySet prop or pathname fallback)
  const pathnameSetId = useMemo(() => {
    const m = pathname.match(/^\/sets\/([^/]+)/);
    return m ? m[1] : null;
  }, [pathname]);

  // Nearest upcoming deadline within 7 days
  const nearestDeadline = useMemo(() => {
    if (!studySet?.deadlines?.length) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const upcoming = studySet.deadlines
      .filter(d => !d.passedAt)
      .map(d => {
        const dt = new Date(d.date);
        dt.setHours(0, 0, 0, 0);
        return { ...d, daysUntil: Math.round((dt.getTime() - today.getTime()) / 86400000) };
      })
      .filter(d => d.daysUntil >= 0)
      .sort((a, b) => a.daysUntil - b.daysUntil);
    return upcoming[0] ?? null;
  }, [studySet]);

  // ─── Mode B: StudySet context nav ────────────────────────────────────────
  if (isModeB) {
    const setId = studySet?._id ?? pathnameSetId ?? '';

    return (
      <nav
        id="left-sidebar"
        role="navigation"
        aria-label="Primary"
        className="flex flex-col h-full w-full bg-[hsl(var(--surface))] border-r border-[hsl(var(--border))] overflow-hidden"
      >
        {/* Back to All Study Sets */}
        <div className="px-1 py-1 shrink-0">
          <Link
            href="/sets"
            onClick={onNavigate}
            className="flex items-center gap-1.5 px-3 h-[30px] text-[12px] text-[hsl(var(--foreground-muted))] hover:text-foreground hover:bg-[hsl(var(--surface-2))] transition-colors duration-75 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          >
            <ChevronLeft size={12} aria-hidden="true" />
            <span>All Study Sets</span>
          </Link>
        </div>

        <Divider />

        {/* Set header: name + overflow menu + deadline urgency */}
        <div className="px-3 py-2 shrink-0">
          <div className="flex items-center gap-1 group">
            <span className="text-[13px] font-medium truncate flex-1 min-w-0 text-foreground">
              {studySet?.name ?? '…'}
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="opacity-0 group-hover:opacity-100 flex items-center justify-center w-5 h-5 rounded hover:bg-[hsl(var(--surface-2))] transition-all duration-75 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus-ring"
                  aria-label="Study set options"
                >
                  <MoreHorizontal size={14} aria-hidden="true" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-44">
                <DropdownMenuItem>Edit</DropdownMenuItem>
                <DropdownMenuItem>Duplicate</DropdownMenuItem>
                <DropdownMenuItem onClick={() => studySet && onArchiveStudySet?.(studySet._id, true)}>
                  Archive
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-[hsl(var(--danger))]"
                  onClick={() => studySet && onDeleteStudySet?.(studySet._id)}
                >
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          {nearestDeadline && nearestDeadline.daysUntil <= 7 && (
            <p
              className={cn(
                'text-[10px] mt-0.5',
                nearestDeadline.daysUntil <= 3
                  ? 'text-[hsl(var(--danger))]'
                  : 'text-[hsl(var(--warning))]'
              )}
            >
              {nearestDeadline.label} · {nearestDeadline.daysUntil}d
            </p>
          )}
        </div>

        <Divider />

        {/* Pulse + Smart Coach */}
        <div className="px-1 py-1 shrink-0">
          <ModeBNavItem
            href={`/sets/${setId}`}
            icon={LayoutDashboard}
            label="Pulse"
            exact
            onNavigate={onNavigate}
          />
          <ModeBNavItem
            href={`/sets/${setId}/coach`}
            icon={MessageCircle}
            label="Smart Coach"
            onNavigate={onNavigate}
          />
        </div>

        <Divider />

        {/* Documents — scrollable */}
        <div className="flex flex-col flex-1 overflow-y-auto overflow-x-hidden min-h-0 py-1">
          <p className="px-3 text-[9px] font-medium uppercase tracking-[0.08em] text-[hsl(var(--foreground-subtle))] mb-0.5 shrink-0">
            Documents
          </p>
          {documents && documents.length > 0 ? (
            <div className="flex flex-col px-1">
              {documents.map(doc => (
                <Link
                  key={doc._id}
                  href={`/sets/${setId}/documents/${doc._id}`}
                  onClick={onNavigate}
                  className="flex items-center gap-2 px-3 h-[28px] text-[12px] text-[hsl(var(--foreground-muted))] hover:bg-[hsl(var(--surface))] hover:text-foreground transition-colors duration-75 rounded-sm"
                >
                  <span
                    className="shrink-0 rounded-full"
                    style={{
                      width: 6,
                      height: 6,
                      backgroundColor: doc.ingestionStatus === 'ready'
                        ? 'hsl(var(--success))'
                        : 'hsl(var(--warning))',
                    }}
                    aria-hidden="true"
                  />
                  <span className="truncate">{doc.title}</span>
                </Link>
              ))}
            </div>
          ) : documents ? (
            <p className="px-3 text-[11px] text-[hsl(var(--foreground-subtle))] italic">
              No documents yet
            </p>
          ) : null}
          {/* Upload + New Note actions */}
          <div className="flex gap-3 px-3 mt-1 shrink-0">
            <button
              onClick={onUpload}
              className="text-[12px] text-[hsl(var(--foreground-subtle))] hover:text-foreground transition-colors duration-75 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus-ring rounded"
            >
              + Upload
            </button>
            <button
              onClick={onNewNote}
              className="text-[12px] text-[hsl(var(--foreground-subtle))] hover:text-foreground transition-colors duration-75 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus-ring rounded"
            >
              + New Note
            </button>
          </div>
        </div>

        <Divider />

        {/* Flashcards, Feynman, Cornell Notes */}
        <div className="px-1 py-1 shrink-0">
          <ModeBNavItem
            href={`/sets/${setId}/flashcards`}
            icon={BookOpen}
            label="Flashcards"
            badge={studySet?.dueCount && studySet.dueCount > 0 ? String(studySet.dueCount) : undefined}
            badgeVariant="danger"
            onNavigate={onNavigate}
          />
          <ModeBNavItem
            href={`/sets/${setId}/feynman`}
            icon={Lightbulb}
            label="Feynman"
            badge={lastFeynmanScore != null ? `${Math.round(lastFeynmanScore)}%` : undefined}
            badgeVariant="warning"
            onNavigate={onNavigate}
          />
          <ModeBNavItem
            href={`/sets/${setId}/notes`}
            icon={FileText}
            label="Cornell Notes"
            onNavigate={onNavigate}
          />
        </div>

        <Divider />

        {/* Deadlines */}
        <div className="px-1 py-1 shrink-0">
          <ModeBNavItem
            href={`/sets/${setId}?panel=deadlines`}
            icon={Calendar}
            label="Deadlines"
            badge={nearestDeadline && nearestDeadline.daysUntil <= 7
              ? `${nearestDeadline.daysUntil}d`
              : undefined}
            badgeVariant={nearestDeadline && nearestDeadline.daysUntil <= 3 ? 'danger' : 'warning'}
            neverActive
            onNavigate={onNavigate}
          />
        </div>
      </nav>
    );
  }

  // ─── Mode A: Global nav ────────────────────────────────────────────────────
  return (
    <nav
      id="left-sidebar"
      role="navigation"
      aria-label="Primary"
      className="flex flex-col h-full w-full bg-[hsl(var(--surface))] border-r border-[hsl(var(--border))] overflow-hidden"
    >
      {/* Logo row — 40px to align with TopBar h-11 */}
      <div className="flex items-center h-10 px-3 shrink-0">
        <span className="text-[14px] font-medium text-[hsl(var(--primary))] select-none">
          Synapse
        </span>
      </div>

      <Divider />

      {/* ⌘K shortcut row — 30px */}
      <button
        onClick={onCommandPaletteOpen}
        className="flex items-center gap-2 px-3 h-[30px] w-full text-[12px] text-[hsl(var(--foreground-muted))] hover:bg-[hsl(var(--surface-2))] transition-colors duration-75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring shrink-0"
        aria-label="Open command palette"
      >
        <Search size={12} aria-hidden="true" className="shrink-0" />
        <span className="flex-1 text-left">Search</span>
        <kbd className="font-mono text-[11px] opacity-70" aria-hidden="true">
          {mod === '⌘' ? '⌘K' : 'Ctrl+K'}
        </kbd>
      </button>

      <Divider />

      {/* Now Brief */}
      <div className="px-1 py-1 shrink-0">
        <NavItem href="/now-brief" icon={Home} label="Now Brief" onNavigate={onNavigate} />
      </div>

      <Divider />

      {/* Study Sets — scrollable section */}
      <div className="flex flex-col flex-1 overflow-y-auto overflow-x-hidden min-h-0 py-1">
        {/* + New Study Set */}
        <div className="px-1 mb-0.5">
          <button
            onClick={onNewStudySet}
            className="flex items-center px-3 h-[30px] w-full text-[12px] italic text-[hsl(var(--foreground-subtle))] hover:bg-[hsl(var(--surface))] hover:text-foreground transition-colors duration-75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring rounded-sm"
          >
            + New Study Set
          </button>
        </div>

        {/* Active sets */}
        <div className="relative px-1 flex flex-col">
          {activeSets.map(set => (
            <SetItem key={set._id} set={set} onNavigate={onNavigate} />
          ))}
          {showSidebarSetsHint && activeSets.length >= 2 && (
            <FirstTimeHint
              hintId="hint:sidebar-sets"
              content="Drag to reorder. Right-click for actions."
              position="right"
            />
          )}
        </div>

        {/* Show archived toggle */}
        {archivedSets.length > 0 && (
          <div className="px-1 mt-0.5">
            <button
              onClick={() => setShowArchived(v => !v)}
              className="flex items-center px-3 h-[30px] w-full text-[12px] italic text-[hsl(var(--foreground-subtle))] hover:bg-[hsl(var(--surface))] transition-colors duration-75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring rounded-sm"
            >
              {showArchived ? 'Hide archived' : `Show archived (${archivedSets.length})`}
            </button>
            {showArchived && (
              <div className="flex flex-col mt-0">
                {archivedSets.map(set => (
                  <ArchivedSetItem
                    key={set._id}
                    set={set}
                    onUnarchive={() => onArchiveStudySet?.(set._id, false)}
                    onNavigate={onNavigate}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <Divider />

      {/* Global Views */}
      <div className="px-1 py-1 shrink-0">
        <p className="px-3 text-[9px] font-medium uppercase tracking-[0.08em] text-[hsl(var(--foreground-subtle))] mb-0.5">
          Global Views
        </p>
        <NavItem href="/flashcards" icon={BookOpen} label="All Flashcards" onNavigate={onNavigate} />
        <NavItem href="/notes" icon={FileText} label="All Notes" onNavigate={onNavigate} />
      </div>

      <Divider />

      {/* Weak Points + Deadlines */}
      <div className="px-1 py-1 shrink-0">
        <NavItem href="/weakpoints" icon={AlertCircle} label="Weak Points" onNavigate={onNavigate} />
        <NavItem href="/deadlines" icon={Calendar} label="Deadlines" onNavigate={onNavigate} />
      </div>

      <Divider />

      {/* Footer: Settings icon + Avatar */}
      <div className="flex items-center justify-between px-3 h-10 shrink-0">
        <Link
          href="/settings/profile"
          onClick={onNavigate}
          className="flex items-center justify-center w-7 h-7 rounded-md text-[hsl(var(--foreground-muted))] hover:bg-[hsl(var(--surface))] hover:text-foreground transition-colors duration-75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          aria-label="Settings"
        >
          <Settings size={14} aria-hidden="true" />
        </Link>
        <Avatar className="h-6 w-6 cursor-default" aria-label={`User: ${user?.email ?? ''}`}>
          <AvatarFallback className="text-[10px]">{initials}</AvatarFallback>
        </Avatar>
      </div>
    </nav>
  );
}
