'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { Home, BookOpen, Search, MessageCircle, Menu, Settings, User, Keyboard, Calendar } from 'lucide-react';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { SHORTCUTS, formatShortcut } from '@/lib/shortcuts';
import { usePlatform } from '@/hooks/usePlatform';
import { cn } from '@/lib/cn';
import Link from 'next/link';

const HIDDEN_ROUTES = ['/signin', '/signup', '/welcome', '/onboarding', '/auth'];

const SHORTCUT_LABELS: Record<string, string> = {
  COMMAND_PALETTE: 'Command palette',
  SEARCH: 'Search',
  TOGGLE_SIDEBAR: 'Toggle sidebar',
  TOGGLE_PANEL: 'Toggle panel',
  FLIP_CARD: 'Flip card',
  ADVANCE_CARD: 'Advance card',
  RATE_AGAIN: 'Rate: again',
  RATE_HARD: 'Rate: hard',
  RATE_GOOD: 'Rate: good',
  RATE_EASY: 'Rate: easy',
  CLOSE: 'Close',
};

interface MobileBottomNavProps {
  onCommandPaletteOpen: () => void;
}

export function MobileBottomNav({ onCommandPaletteOpen }: MobileBottomNavProps) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const platform = usePlatform();

  if (HIDDEN_ROUTES.some(r => pathname.startsWith(r))) return null;

  const setIdMatch = pathname.match(/^\/sets\/([^/]+)/);
  const currentSetId = setIdMatch ? setIdMatch[1] : null;
  const coachHref = currentSetId ? `/sets/${currentSetId}/coach` : '/sets';

  const isHome  = pathname === '/' || pathname.startsWith('/now-brief');
  const isCoach = pathname.includes('/coach');
  const isSets  = pathname.startsWith('/sets') && !isCoach;

  const tabCls = (active: boolean) =>
    cn('flex flex-col items-center justify-center gap-0.5 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring', active ? 'text-primary' : 'text-foreground-muted');

  return (
    <>
      <nav
        aria-label="Mobile navigation"
        className="md:hidden fixed bottom-0 inset-x-0 z-40 grid grid-cols-5 bg-surface border-t border-border"
        style={{ height: 'calc(56px + env(safe-area-inset-bottom))', paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <Link href="/now-brief" className={tabCls(isHome)} aria-current={isHome ? 'page' : undefined}>
          <Home className="h-5 w-5" aria-hidden="true" />
          <span className="text-[10px] font-mono">Home</span>
        </Link>

        <Link href="/sets" className={tabCls(isSets)} aria-current={isSets ? 'page' : undefined}>
          <BookOpen className="h-5 w-5" aria-hidden="true" />
          <span className="text-[10px] font-mono">Sets</span>
        </Link>

        <button onClick={onCommandPaletteOpen} className={tabCls(false)} aria-label="Search">
          <Search className="h-5 w-5" aria-hidden="true" />
          <span className="text-[10px] font-mono">Search</span>
        </button>

        <Link href={coachHref} className={tabCls(isCoach)} aria-current={isCoach ? 'page' : undefined}>
          <MessageCircle className="h-5 w-5" aria-hidden="true" />
          <span className="text-[10px] font-mono">Coach</span>
        </Link>

        <button onClick={() => setMoreOpen(true)} className={tabCls(false)} aria-label="More">
          <Menu className="h-5 w-5" aria-hidden="true" />
          <span className="text-[10px] font-mono">More</span>
        </button>
      </nav>

      {/* More: bottom sheet */}
      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="rounded-t-xl px-0">
          <div className="pt-2 pb-6">
            <Link
              href="/deadlines"
              onClick={() => setMoreOpen(false)}
              className="flex items-center gap-3 px-6 py-4 text-sm hover:bg-surface-2 transition-colors"
            >
              <Calendar className="h-5 w-5 text-foreground-muted" aria-hidden="true" />
              Deadlines
            </Link>
            <Link
              href="/settings"
              onClick={() => setMoreOpen(false)}
              className="flex items-center gap-3 px-6 py-4 text-sm hover:bg-surface-2 transition-colors"
            >
              <Settings className="h-5 w-5 text-foreground-muted" aria-hidden="true" />
              Settings
            </Link>
            <Link
              href="/settings/profile"
              onClick={() => setMoreOpen(false)}
              className="flex items-center gap-3 px-6 py-4 text-sm hover:bg-surface-2 transition-colors"
            >
              <User className="h-5 w-5 text-foreground-muted" aria-hidden="true" />
              Profile
            </Link>
            <button
              onClick={() => { setMoreOpen(false); setShortcutsOpen(true); }}
              className="flex w-full items-center gap-3 px-6 py-4 text-sm hover:bg-surface-2 transition-colors"
            >
              <Keyboard className="h-5 w-5 text-foreground-muted" aria-hidden="true" />
              Keyboard shortcuts
            </button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Keyboard shortcuts dialog */}
      <Dialog open={shortcutsOpen} onOpenChange={setShortcutsOpen}>
        <DialogContent className="max-w-sm p-6">
          <DialogHeader>
            <DialogTitle>Keyboard Shortcuts</DialogTitle>
          </DialogHeader>
          <div className="mt-4 space-y-2">
            {(Object.entries(SHORTCUTS) as [string, string][]).map(([key, shortcut]) => (
              <div key={key} className="flex items-center justify-between text-sm">
                <span className="text-foreground-muted">{SHORTCUT_LABELS[key] ?? key}</span>
                <kbd className="font-mono text-xs bg-surface-2 border border-border rounded px-2 py-0.5">
                  {formatShortcut(shortcut, platform)}
                </kbd>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
