'use client';

import { useTranslation } from 'react-i18next';
import { useTheme } from 'next-themes';
import { PanelLeft, Search, MessageSquare, Sun, Moon, Monitor, Settings, LogOut, User, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { useModKey } from '@/hooks/usePlatform';
import { useAuthStore } from '@/store/auth';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/cn';
import { useNavigationHistory } from '@/contexts/NavigationHistoryContext';
import type { ReadinessBreakdown } from '@/lib/api/study-sets';
import { useFirstTimeHint } from '@/hooks/useFirstTimeHint';
import { FirstTimeHint } from '@/components/patterns/FirstTimeHint';
import { ModelToggle } from './ModelToggle';

export type BreadcrumbItem = string | { label: string; href?: string };

interface ReadinessPillProps {
  score: number;
  breakdown: ReadinessBreakdown;
}

function ReadinessPill({ score, breakdown }: ReadinessPillProps) {
  const scoreColor =
    score >= 85 ? 'text-[hsl(var(--success))]' :
    score >= 60 ? 'text-[hsl(var(--warning))]' :
                  'text-[hsl(var(--danger))]';

  const rows: { label: string; value: number; weight: number }[] = [
    { label: 'Retention rate',      value: breakdown.retentionRate,      weight: 0.40 },
    { label: 'Feynman clarity',     value: breakdown.feynmanClarity,     weight: 0.30 },
    { label: 'Deadline urgency',    value: breakdown.deadlineUrgency,    weight: 0.20 },
    { label: 'Review completeness', value: breakdown.reviewCompleteness, weight: 0.10 },
  ];

  const rawTotal = rows.reduce((sum, r) => sum + r.value * r.weight * 100, 0);
  const { shouldShow: showReadinessHint } = useFirstTimeHint('hint:topbar-readiness');

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="relative flex items-center gap-1.5 rounded px-2 py-0.5 border border-[hsl(var(--border))] bg-[hsl(var(--surface))] hover:bg-[hsl(var(--surface-2))] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--focus-ring))]"
          style={{ borderRadius: '4px' }}
          aria-label={`Readiness score: ${score}`}
        >
          <span className="text-[10px] uppercase tracking-wide text-foreground-muted">Readiness</span>
          <span className={cn('text-[13px] font-mono font-medium', scoreColor)}>{score}</span>
          {showReadinessHint && score !== 100 && (
            <FirstTimeHint
              hintId="hint:topbar-readiness"
              content="Readiness reflects how prepared you are for your deadlines. Click for the formula."
              position="bottom"
            />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="min-w-[320px] p-4"
        style={{ borderRadius: '8px' }}
      >
        <p className="text-sm font-medium mb-3">Your Readiness Score</p>
        <div className="space-y-2">
          {rows.map(row => {
            const pct = Math.round(row.value * 100);
            const contribution = row.value * row.weight * 100;
            return (
              <div key={row.label} className="flex items-center gap-2 text-xs">
                <span className="w-36 text-foreground-muted shrink-0">{row.label}</span>
                <div
                  className="relative h-1.5 rounded-full shrink-0 overflow-hidden"
                  style={{ width: '80px', backgroundColor: 'hsl(var(--surface-3))' }}
                  aria-hidden="true"
                >
                  <div
                    className="absolute inset-y-0 left-0 rounded-full"
                    style={{ width: `${pct}%`, backgroundColor: 'hsl(var(--foreground-muted))' }}
                  />
                </div>
                <span className="font-mono text-foreground-muted w-8 text-right shrink-0">{pct}%</span>
                <span className="font-mono text-foreground-subtle shrink-0">×{Math.round(row.weight * 100)}%</span>
                <span className="font-mono text-foreground-muted w-10 text-right shrink-0">= {contribution.toFixed(1)}</span>
              </div>
            );
          })}
        </div>
        <div className="mt-3 pt-3 border-t border-border flex items-center justify-between text-xs">
          <span className="text-foreground-muted">Total</span>
          <span className="font-mono text-foreground-muted">{rawTotal.toFixed(1)} → <span className={cn('font-medium', scoreColor)}>{score}</span></span>
        </div>
      </PopoverContent>
    </Popover>
  );
}

interface TopBarProps {
  sidebarOpen: boolean;
  onSidebarToggle: () => void;
  onCommandPaletteOpen: () => void;
  onSearchOpen?: () => void;
  onCoachOpen?: () => void;
  sidePanelOpen?: boolean;
  syncStatus?: 'synced' | 'saving' | 'error';
  breadcrumb?: BreadcrumbItem[];
  studyingElapsed?: number | null;
  readinessScore?: number | null;
  readinessBreakdown?: ReadinessBreakdown | null;
}

function SyncDot({ status = 'synced' }: { status?: 'synced' | 'saving' | 'error' }) {
  const { t } = useTranslation();
  const label = t(`shell.syncStatus.${status}`);
  const colorClass =
    status === 'synced' ? 'bg-success' :
    status === 'saving' ? 'bg-warning' :
    'bg-danger';

  return (
    <div
      className="flex items-center gap-1.5"
      aria-live="polite"
      aria-label={label}
    >
      <span
        className={cn('h-2 w-2 rounded-full', colorClass, status === 'saving' && 'animate-pulse')}
        aria-hidden="true"
      />
    </div>
  );
}

function ThemeToggle() {
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();
  // next-themes resolves `theme` from localStorage on the client, so the
  // server render and the first client render disagree on which icon/label
  // to show. Gate everything theme-dependent on `mounted` and fall back to
  // the system entry pre-mount; both render the same Monitor icon so SSR
  // and hydration match.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const themes = [
    { key: 'system', Icon: Monitor, label: t('shell.themes.system') },
    { key: 'light',  Icon: Sun,     label: t('shell.themes.light')  },
    { key: 'dark',   Icon: Moon,    label: t('shell.themes.dark')   },
  ] as const;

  const current = mounted ? (themes.find(t => t.key === theme) ?? themes[0]) : themes[0];
  const CurrentIcon = current.Icon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t('shell.themeToggle', { theme: current.label })}
          aria-keyshortcuts=""
        >
          <CurrentIcon className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{t('shell.themes.system')}</DropdownMenuLabel>
        {themes.map(({ key, Icon, label }) => (
          <DropdownMenuItem
            key={key}
            onClick={() => setTheme(key)}
            className={cn(theme === key && 'bg-primary-soft text-primary')}
          >
            <Icon className="h-4 w-4" />
            {label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const SETTINGS_LABELS: Record<string, string> = {
  profile:     'Profile',
  preferences: 'Preferences',
  'api-keys':  'API Keys',
  billing:     'Billing',
};

function Breadcrumbs({ breadcrumb }: { breadcrumb: BreadcrumbItem[] }) {
  const pathname = usePathname();

  // For settings routes, auto-append the sub-page label if not already present
  const crumbs = (() => {
    const settingsMatch = pathname.match(/^\/settings\/([^/]+)/);
    if (settingsMatch) {
      const subKey = settingsMatch[1];
      const subLabel = SETTINGS_LABELS[subKey];
      if (subLabel) {
        return [
          { label: 'Settings', href: '/settings/profile' } as BreadcrumbItem,
          { label: subLabel } as BreadcrumbItem,
        ];
      }
      return [{ label: 'Settings' } as BreadcrumbItem];
    }
    return breadcrumb;
  })();

  if (crumbs.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb" className="hidden sm:flex items-center gap-1 text-xs text-foreground-muted min-w-0">
      {crumbs.map((crumb, i) => {
        const label  = typeof crumb === 'string' ? crumb : crumb.label;
        const href   = typeof crumb === 'string' ? undefined : crumb.href;
        const isLast = i === crumbs.length - 1;

        return (
          <span key={i} className="flex items-center gap-1 min-w-0">
            {i > 0 && (
              <span className="text-foreground-subtle/60 shrink-0" aria-hidden="true">/</span>
            )}
            {href && !isLast ? (
              <Link
                href={href}
                className="truncate max-w-[160px] hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring rounded"
              >
                {label}
              </Link>
            ) : (
              <span
                aria-current={isLast ? 'page' : undefined}
                className={cn('truncate max-w-[160px]', isLast ? 'text-foreground font-medium' : 'text-foreground-subtle')}
              >
                {label}
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}

export function TopBar({
  sidebarOpen,
  onSidebarToggle,
  onCommandPaletteOpen,
  onSearchOpen,
  onCoachOpen,
  sidePanelOpen,
  syncStatus = 'synced',
  breadcrumb = [],
  studyingElapsed = null,
  readinessScore = null,
  readinessBreakdown = null,
}: TopBarProps) {
  const { t } = useTranslation();
  const mod = useModKey();
  const { user, logout } = useAuthStore();
  const initials = user?.email?.[0]?.toUpperCase() ?? 'U';
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const { shouldShow: showCmdHint } = useFirstTimeHint('hint:command-palette');
  const { canGoBack, canGoForward, goBack, goForward, isStudySession } = useNavigationHistory();
  const [pendingNav, setPendingNav] = useState<(() => void) | null>(null);

  function handleBack() {
    if (isStudySession(pathname)) {
      setPendingNav(() => () => goBack(router));
    } else {
      goBack(router);
    }
  }

  function handleForward() {
    if (isStudySession(pathname)) {
      setPendingNav(() => () => goForward(router));
    } else {
      goForward(router);
    }
  }

  return (
    <>
    <AlertDialog open={pendingNav !== null} onOpenChange={(open) => { if (!open) setPendingNav(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Leave this session?</AlertDialogTitle>
          <AlertDialogDescription>Your progress is saved.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Stay</AlertDialogCancel>
          <AlertDialogAction onClick={() => { pendingNav?.(); setPendingNav(null); }}>Leave</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    <header
      role="banner"
      className="sticky top-0 z-sticky flex h-11 items-center gap-2 border-b border-border/60 bg-background/95 px-3 backdrop-blur-md"
    >
      {/* Back / Forward */}
      <Button
        variant="ghost"
        size="icon"
        className="h-[26px] w-[26px]"
        onClick={handleBack}
        disabled={!canGoBack}
        aria-label="Back"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-[26px] w-[26px]"
        onClick={handleForward}
        disabled={!canGoForward}
        aria-label="Forward"
      >
        <ChevronRight className="h-3.5 w-3.5" />
      </Button>

      {/* Divider */}
      <div className="h-4 w-px bg-border shrink-0" aria-hidden="true" />

      {/* Sidebar toggle */}
      <Button
        variant="ghost"
        size="icon"
        onClick={onSidebarToggle}
        aria-expanded={sidebarOpen}
        aria-controls="left-sidebar"
        aria-label={t('shell.sidebarToggle')}
        aria-keyshortcuts={`${mod}+B`}
      >
        <PanelLeft className="h-4 w-4" />
      </Button>

      {/* Breadcrumb */}
      <Breadcrumbs breadcrumb={breadcrumb} />

      {/* Command palette trigger — center */}
      <div className="mx-auto flex-1 max-w-sm relative">
        <button
          onClick={onCommandPaletteOpen}
          className={cn(
            'flex w-full items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 h-7',
            'text-xs text-foreground-muted hover:bg-surface-3 min-w-[160px] transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring cursor-pointer'
          )}
          aria-label={t('shell.commandPalettePlaceholder')}
          aria-keyshortcuts={`${mod}+K`}
        >
          <Search className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="flex-1 text-left truncate">{t('shell.commandPalettePlaceholder')}</span>
          <kbd className="font-mono text-xs opacity-60" aria-hidden="true">{mod === '⌘' ? '⌘K' : 'Ctrl+K'}</kbd>
        </button>
        {showCmdHint && (
          <FirstTimeHint
            hintId="hint:command-palette"
            content="Press ⌘K to search and run any action"
            position="bottom"
          />
        )}
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-1">
        {studyingElapsed !== null && (
          <div
            className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-[hsl(var(--success-soft))] text-[hsl(var(--success))] border border-[hsl(var(--success)/0.2)]"
            aria-label={`Studying — ${studyingElapsed} minutes`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--success))] animate-pulse" aria-hidden="true" />
            <span>Studying</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono">{studyingElapsed}m</span>
          </div>
        )}
        {onSearchOpen && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onSearchOpen}
            aria-label="Search (Ctrl+Shift+F)"
            aria-keyshortcuts="Ctrl+Shift+F"
            title="Search (Ctrl+Shift+F)"
          >
            <Search className="h-4 w-4" />
          </Button>
        )}
        {onCoachOpen && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onCoachOpen}
            aria-label="Smart Coach (Ctrl+.)"
            aria-keyshortcuts="Ctrl+."
            aria-pressed={sidePanelOpen}
            title="Smart Coach (Ctrl+.)"
            className={cn(sidePanelOpen && 'bg-primary/10 text-primary')}
          >
            <MessageSquare className="h-4 w-4" />
          </Button>
        )}
        {readinessScore !== null && readinessBreakdown !== null && (
          <ReadinessPill score={readinessScore} breakdown={readinessBreakdown} />
        )}
        {syncStatus !== 'synced' && <SyncDot status={syncStatus} />}
        <ModelToggle />
        <ThemeToggle />

        {/* User avatar dropdown */}
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Open user menu"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              className="rounded-full"
            >
              <Avatar className="h-7 w-7">
                {user?.avatarUrl && <AvatarImage src={user.avatarUrl} alt={initials} />}
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel className="font-normal">
              <p className="text-sm font-medium">{user?.displayName ?? user?.email}</p>
              {user?.displayName && <p className="text-xs text-foreground-subtle">{user.email}</p>}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/settings/profile" className="flex items-center gap-2">
                <User className="h-4 w-4" />
                {t('settings.tabs.profile')}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/settings/preferences" className="flex items-center gap-2">
                <Settings className="h-4 w-4" />
                {t('nav.settings')}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => logout()}
              className="text-danger focus:text-danger cursor-pointer"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
    </>
  );
}
