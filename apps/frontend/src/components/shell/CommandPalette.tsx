'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { Command } from 'cmdk';
import {
  LayoutDashboard, BookOpen, FileText, Zap, Settings,
  MessageSquare, Plus, Search, ArrowRight, Upload, FileSpreadsheet, Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { useModKey } from '@/hooks/usePlatform';
import type { StudySet } from '@/lib/api/study-sets';
import { useAIStatus } from '@/contexts/AIStatusContext';

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  currentStudySetId?: string;
  onOpenCoach?: () => void;
  studySets?: StudySet[];
  onNewStudySet?: () => void;
}

const NAVIGATE_ITEMS = [
  { label: 'Now Brief',         href: '/now-brief',        icon: LayoutDashboard },
  { label: 'Master Flashcards', href: '/flashcards',       icon: BookOpen        },
  { label: 'All PDFs',          href: '/pdfs',             icon: FileText        },
  { label: 'Settings',          href: '/settings/profile', icon: Settings        },
] as const;

const groupCls = [
  '[&>[cmdk-group-heading]]:px-2',
  '[&>[cmdk-group-heading]]:py-1.5',
  '[&>[cmdk-group-heading]]:text-[10px]',
  '[&>[cmdk-group-heading]]:font-medium',
  '[&>[cmdk-group-heading]]:text-foreground-subtle',
  '[&>[cmdk-group-heading]]:uppercase',
  '[&>[cmdk-group-heading]]:tracking-wider',
].join(' ');

const itemCls = cn(
  'flex items-center gap-3 rounded-md px-3 py-2 text-sm text-foreground cursor-pointer select-none',
  'data-[selected=true]:bg-primary/8 data-[selected=true]:text-primary',
  'outline-none transition-colors'
);

export function CommandPalette({
  open,
  onClose,
  currentStudySetId,
  onOpenCoach,
  studySets,
  onNewStudySet,
}: CommandPaletteProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const modKey = useModKey();
  const triggerRef = useRef<HTMLElement | null>(null);
  const { status: aiStatus } = useAIStatus();
  const aiUnavailable = aiStatus === 'unavailable';

  useEffect(() => {
    if (open) {
      triggerRef.current = document.activeElement as HTMLElement;
    } else if (triggerRef.current) {
      triggerRef.current.focus();
      triggerRef.current = null;
    }
  }, [open]);

  const go = (href: string) => { router.push(href); onClose(); };

  const currentSet = studySets?.find(s => s._id === currentStudySetId);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-modal"
      onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); } }}
    >
      {/* Backdrop — always dark with blur regardless of theme */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in-0 duration-150"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Palette */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="relative mx-auto mt-[8vh] w-[calc(100%-2rem)] max-w-lg md:max-w-xl rounded-xl border border-border bg-background shadow-2xl animate-in fade-in-0 zoom-in-95 duration-150"
      >
        <Command
          className="flex h-full flex-col overflow-hidden rounded-xl"
          shouldFilter={true}
        >
          {/* Search input */}
          <div className="flex items-center gap-3 border-b border-border px-4 py-3">
            <Search className="h-4 w-4 shrink-0 text-foreground-subtle" aria-hidden="true" />
            <Command.Input
              placeholder="Search or run a command…"
              className="flex-1 bg-transparent text-sm text-foreground placeholder:text-foreground-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring rounded"
              autoFocus
            />
            <div className="hidden sm:flex items-center gap-1.5">
              <kbd className="flex items-center rounded border border-border bg-surface-2 px-1.5 py-0.5 text-[10px] font-mono text-foreground-subtle">
                {modKey}K
              </kbd>
              <kbd
                className="flex items-center rounded border border-border bg-surface-2 px-1.5 py-0.5 text-[10px] font-mono text-foreground-subtle cursor-pointer hover:bg-surface-3 transition-colors"
                onClick={onClose}
                role="button"
                tabIndex={-1}
                aria-label="Close"
              >
                Esc
              </kbd>
            </div>
          </div>

          <Command.List
            className="max-h-[min(60vh,420px)] overflow-y-auto overscroll-contain p-1.5"
            aria-live="polite"
          >
            <Command.Empty className="py-10 text-center text-sm text-foreground-subtle">
              <p className="mb-3">No results found.</p>
              {(onOpenCoach || currentStudySetId) && (
                <button
                  className="inline-flex items-center gap-1.5 text-primary hover:underline cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring rounded text-sm"
                  onClick={() => {
                    if (currentStudySetId) {
                      go(`/sets/${currentStudySetId}/coach`);
                    } else {
                      onOpenCoach?.();
                      onClose();
                    }
                  }}
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                  Ask Smart Coach instead
                </button>
              )}
            </Command.Empty>

            {/* Current set quick-actions */}
            {currentSet && (
              <Command.Group heading={currentSet.name} className={groupCls}>
                <Command.Item value={`${currentSet.name} review flashcards`} onSelect={() => go(`/sets/${currentSet._id}/flashcards`)} className={itemCls}>
                  <BookOpen className="h-4 w-4 shrink-0 text-foreground-muted" aria-hidden="true" />
                  Review Flashcards
                  <ArrowRight className="ml-auto h-3.5 w-3.5 text-foreground-subtle" aria-hidden="true" />
                </Command.Item>
                <Command.Item value={`${currentSet.name} feynman session`} onSelect={() => go(`/sets/${currentSet._id}/feynman`)} className={itemCls}>
                  <Zap className="h-4 w-4 shrink-0 text-foreground-muted" aria-hidden="true" />
                  Feynman Session
                  <ArrowRight className="ml-auto h-3.5 w-3.5 text-foreground-subtle" aria-hidden="true" />
                </Command.Item>
                <Command.Item value={`${currentSet.name} notes`} onSelect={() => go(`/sets/${currentSet._id}/notes`)} className={itemCls}>
                  <FileText className="h-4 w-4 shrink-0 text-foreground-muted" aria-hidden="true" />
                  Notes
                  <ArrowRight className="ml-auto h-3.5 w-3.5 text-foreground-subtle" aria-hidden="true" />
                </Command.Item>
              </Command.Group>
            )}

            {/* Navigate */}
            <Command.Group heading={t('commandPalette.groups.navigate')} className={cn(groupCls, currentSet && 'mt-1')}>
              {NAVIGATE_ITEMS.map(({ label, href, icon: Icon }) => (
                <Command.Item key={href} value={label} onSelect={() => go(href)} className={itemCls}>
                  <Icon className="h-4 w-4 shrink-0 text-foreground-muted" aria-hidden="true" />
                  {label}
                  <ArrowRight className="ml-auto h-3.5 w-3.5 text-foreground-subtle" aria-hidden="true" />
                </Command.Item>
              ))}
            </Command.Group>

            {/* Study sets */}
            {studySets && studySets.length > 0 && (
              <Command.Group heading="Study Sets" className={cn(groupCls, 'mt-1')}>
                {studySets.map(set => (
                  <Command.Item key={set._id} value={`go to ${set.name}`} onSelect={() => go(`/sets/${set._id}`)} className={itemCls}>
                    <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: set.color }} aria-hidden="true" />
                    {set.name}
                    <ArrowRight className="ml-auto h-3.5 w-3.5 text-foreground-subtle" aria-hidden="true" />
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {/* Actions */}
            <Command.Group heading={t('commandPalette.groups.actions')} className={cn(groupCls, 'mt-1')}>
              <Command.Item value="New Study Set create" onSelect={() => { onNewStudySet?.(); }} className={itemCls}>
                <Plus className="h-4 w-4 shrink-0 text-foreground-muted" aria-hidden="true" />
                New Study Set
              </Command.Item>
              <Command.Item value="Import flashcards CSV" onSelect={() => go(currentStudySetId ? `/sets/${currentStudySetId}/flashcards` : '/flashcards')} className={itemCls}>
                <FileSpreadsheet className="h-4 w-4 shrink-0 text-foreground-muted" aria-hidden="true" />
                Import Flashcards from CSV
              </Command.Item>
              <Command.Item
                value="Upload PDF"
                onSelect={() => go(currentStudySetId ? `/sets/${currentStudySetId}` : '/pdfs')}
                className={itemCls}
              >
                <Upload className="h-4 w-4 shrink-0 text-foreground-muted" aria-hidden="true" />
                Upload PDF
              </Command.Item>
              <Command.Item
                value="Add deadline"
                onSelect={() => go(currentStudySetId ? `/sets/${currentStudySetId}?panel=deadlines` : '/now-brief')}
                className={itemCls}
              >
                <Plus className="h-4 w-4 shrink-0 text-foreground-muted" aria-hidden="true" />
                Add deadline
              </Command.Item>
            </Command.Group>

            {/* Smart Coach */}
            <Command.Group heading={t('commandPalette.groups.smartCoach')} className={cn(groupCls, 'mt-1')}>
              <Command.Item
                value="Ask Smart Coach open coach"
                onSelect={() => {
                  if (currentStudySetId) {
                    go(`/sets/${currentStudySetId}/coach`);
                  } else {
                    onOpenCoach?.();
                    onClose();
                  }
                }}
                className={itemCls}
              >
                <MessageSquare className="h-4 w-4 shrink-0 text-foreground-muted" aria-hidden="true" />
                {currentStudySetId ? 'Open Smart Coach' : 'Ask Smart Coach'}
              </Command.Item>
              <Command.Item
                value="Generate flashcards from PDF AI batch"
                onSelect={() => {
                  if (!aiUnavailable && currentStudySetId) {
                    go(`/sets/${currentStudySetId}/flashcards`);
                  }
                }}
                disabled={aiUnavailable}
                className={cn(itemCls, aiUnavailable && 'opacity-50 cursor-not-allowed')}
                aria-disabled={aiUnavailable}
              >
                <Sparkles className="h-4 w-4 shrink-0 text-foreground-muted" aria-hidden="true" />
                Generate flashcards from PDF
                {aiUnavailable
                  ? <span className="ml-auto text-[10px] font-mono text-foreground-subtle">Requires AI</span>
                  : <ArrowRight className="ml-auto h-3.5 w-3.5 text-foreground-subtle" aria-hidden="true" />
                }
              </Command.Item>
            </Command.Group>
          </Command.List>

          {/* Footer */}
          <div className="border-t border-border px-4 py-2 flex items-center gap-4 text-[10px] text-foreground-subtle">
            <span className="flex items-center gap-1"><kbd className="font-mono">↑↓</kbd> navigate</span>
            <span className="flex items-center gap-1"><kbd className="font-mono">↵</kbd> select</span>
            <span className="flex items-center gap-1"><kbd className="font-mono">Esc</kbd> close</span>
            <span className="flex items-center gap-1 ml-auto"><kbd className="font-mono">{modKey}/</kbd> search</span>
          </div>
        </Command>
      </div>
    </div>
  );
}
