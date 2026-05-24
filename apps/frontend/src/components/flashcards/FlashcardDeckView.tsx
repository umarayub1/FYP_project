'use client';

import { useState, useRef, useMemo, useCallback, memo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Play, Plus, Search, Tag, ChevronDown, MoreHorizontal, X, Layers, Zap, FileUp, FileText } from 'lucide-react';
import { type Flashcard, deleteFlashcard, suspendFlashcard, bulkDeleteFlashcards, bulkTagFlashcards, bulkMoveFlashcards } from '@/lib/api/flashcards';
import { useBulkSelection } from '@/hooks/useBulkSelection';
import { Marquee } from '@/components/patterns/Marquee';
import { Button } from '@/components/ui/button';
import { FlashcardEditDialog } from './FlashcardEditDialog';
import { CsvImportDialog } from './CsvImportDialog';
import { useShortcut } from '@/hooks/useShortcut';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { formatRelative } from '@/lib/format/date';
import { cn } from '@/lib/cn';
import { EmptyState } from '@/components/patterns/EmptyState';
import { useFirstTimeHint } from '@/hooks/useFirstTimeHint';
import { FirstTimeHint } from '@/components/patterns/FirstTimeHint';

interface FlashcardDeckViewProps {
  studySetId:   string;
  studySetName: string;
  initialCards: Flashcard[];
  dueCount:     number;
}

type StatusFilter = 'all' | 'due' | 'new' | 'suspended' | 'leech';
type SortKey = 'created' | 'reviewed' | 'difficulty-asc' | 'difficulty-desc' | 'alpha';

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'all',       label: 'All' },
  { key: 'due',       label: 'Due' },
  { key: 'new',       label: 'New' },
  { key: 'suspended', label: 'Suspended' },
  { key: 'leech',     label: 'Leech' },
];

interface CardRowProps {
  card: Flashcard;
  selected: boolean;
  onToggleSelect: (id: string, e?: React.MouseEvent) => void;
  onEdit: (card: Flashcard) => void;
  onSuspend: (id: string) => void;
  onDelete: (id: string) => void;
}

const CardRow = memo(function CardRow({
  card,
  selected,
  onToggleSelect,
  onEdit,
  onSuspend,
  onDelete,
}: CardRowProps) {
  const now = new Date().toISOString();
  const isDue = !card.dueDate || card.dueDate <= now;
  const dueLabel = !card.dueDate
    ? 'New'
    : isDue
    ? `Due · ${formatRelative(card.dueDate)}`
    : formatRelative(card.dueDate);

  const suspendLabel = card.suspended ? 'Unsuspend' : 'Suspend';

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div data-selectable-id={card._id} className={cn('flex items-center gap-3 px-4 h-9 rounded-lg hover:bg-surface transition-colors group', selected && 'bg-primary-soft')}>
          <input
            type="checkbox"
            checked={selected}
            onChange={() => {}}
            onClick={e => { e.stopPropagation(); onToggleSelect(card._id, e as unknown as React.MouseEvent); }}
            className={cn('accent-primary shrink-0 transition-opacity cursor-pointer', !selected ? 'opacity-0 group-hover:opacity-100' : 'opacity-100')}
            aria-label={`Select card: ${card.front.slice(0, 40)}`}
          />
          <p className={cn('flex-1 min-w-0 text-[13px] text-foreground truncate', card.suspended && 'line-through text-foreground-muted')}>
            {card.front}
          </p>
          {card.tags[0] && (
            <span className="hidden sm:inline-block text-[11px] bg-primary-soft text-primary px-1.5 py-0.5 rounded-[3px] whitespace-nowrap shrink-0 transition-opacity duration-[80ms] group-hover:opacity-0">
              {card.tags[0]}
            </span>
          )}
          {/* Due info overlaid with hover actions */}
          <div className="relative flex items-center shrink-0 min-w-[170px] justify-end">
            <span className={cn(
              'text-[11px] font-mono transition-opacity duration-[80ms] whitespace-nowrap group-hover:opacity-0',
              isDue && card.dueDate ? 'text-danger' : 'text-foreground-subtle'
            )}>
              {dueLabel}
            </span>
            <div className="absolute inset-0 flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-[80ms] bg-surface rounded-md pl-2">
              <button
                type="button"
                onClick={e => { e.stopPropagation(); onEdit(card); }}
                className="px-1.5 py-0.5 text-[11px] text-foreground-muted hover:text-foreground rounded hover:bg-surface-3 transition-colors cursor-pointer"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={e => { e.stopPropagation(); onSuspend(card._id); }}
                className="px-1.5 py-0.5 text-[11px] text-foreground-muted hover:text-foreground rounded hover:bg-surface-3 transition-colors cursor-pointer"
              >
                {suspendLabel}
              </button>
              <button
                type="button"
                onClick={e => { e.stopPropagation(); onDelete(card._id); }}
                className="px-1.5 py-0.5 text-[11px] text-[hsl(var(--danger))] rounded hover:bg-[hsl(var(--danger-soft))] transition-colors cursor-pointer"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      </ContextMenuTrigger>

      <ContextMenuContent className="w-48">
        <ContextMenuItem onSelect={() => onEdit(card)}>Edit</ContextMenuItem>
        <ContextMenuItem onSelect={() => onSuspend(card._id)}>{suspendLabel}</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          onSelect={() => onDelete(card._id)}
          className="text-[hsl(var(--danger))] focus:text-[hsl(var(--danger))]"
        >
          Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
});

export function FlashcardDeckView({
  studySetId,
  studySetName,
  initialCards,
  dueCount,
}: FlashcardDeckViewProps) {
  const router = useRouter();
  const { shouldShow: showCramHint } = useFirstTimeHint('hint:cram-mode');
  const [cards, setCards]                   = useState(initialCards);
  const [search, setSearch]                 = useState('');
  const [searchOpen, setSearchOpen]         = useState(false);
  const [status, setStatus]                 = useState<StatusFilter>('all');
  const [tagFilters, setTagFilters]         = useState<string[]>([]);
  const [sourceFilter, setSourceFilter]     = useState('');
  const [sort, setSort]                     = useState<SortKey>('created');
  const [tagDropOpen, setTagDropOpen]       = useState(false);
  const [sourceDropOpen, setSourceDropOpen] = useState(false);
  const [editCard, setEditCard]             = useState<Flashcard | undefined>(undefined);
  const [editOpen, setEditOpen]             = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkTagOpen, setBulkTagOpen]       = useState(false);
  const [bulkTagInput, setBulkTagInput]     = useState('');
  const [bulkTagMode, setBulkTagMode]       = useState<'add' | 'remove'>('add');
  const [cramSheetOpen, setCramSheetOpen]   = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useShortcut('meta+shift+c', useCallback(() => setCramSheetOpen(true), []));

  const now = new Date().toISOString();

  const allTags = useMemo(() => {
    const set = new Set<string>();
    cards.forEach(c => c.tags.forEach(t => set.add(t)));
    return Array.from(set).sort();
  }, [cards]);

  const allSources = useMemo(() => {
    const set = new Set<string>();
    cards.forEach(c => { if (c.sourceTitle) set.add(c.sourceTitle); });
    return Array.from(set).sort();
  }, [cards]);

  const filtered = useMemo(() => {
    let result = cards;

    if (status === 'due')       result = result.filter(c => !c.dueDate || c.dueDate <= now);
    if (status === 'new')       result = result.filter(c => !c.repetitions || c.repetitions === 0);
    if (status === 'suspended') result = result.filter(c => !!c.suspended);
    if (status === 'leech')     result = result.filter(c => !!c.isLeech);

    if (tagFilters.length > 0)
      result = result.filter(c => tagFilters.some(t => c.tags.includes(t)));

    if (sourceFilter)
      result = result.filter(c => c.sourceTitle === sourceFilter);

    if (search)
      result = result.filter(c =>
        c.front.toLowerCase().includes(search.toLowerCase()) ||
        c.back.toLowerCase().includes(search.toLowerCase())
      );

    if (sort === 'alpha')           result = [...result].sort((a, b) => a.front.localeCompare(b.front));
    if (sort === 'difficulty-asc')  result = [...result].sort((a, b) => (a.interval ?? 0) - (b.interval ?? 0));
    if (sort === 'difficulty-desc') result = [...result].sort((a, b) => (b.interval ?? 0) - (a.interval ?? 0));

    return result;
  }, [cards, status, tagFilters, search, sort, now, sourceFilter]);

  const getId = useCallback((c: Flashcard) => c._id, []);
  const bulk = useBulkSelection({ items: filtered, getId });

  const toggleSelect = useCallback((id: string, e?: React.MouseEvent) => {
    bulk.toggle(id, { shift: e?.shiftKey, cmd: e?.metaKey || e?.ctrlKey });
  }, [bulk]);

  const handleDelete = useCallback(async (cardId: string) => {
    await deleteFlashcard(cardId, studySetId).catch(() => {});
    setCards(prev => prev.filter(c => c._id !== cardId));
  }, [studySetId]);

  const handleSuspend = useCallback(async (cardId: string) => {
    setCards(prev => prev.map(c =>
      c._id === cardId ? { ...c, suspended: !c.suspended } : c
    ));
    await suspendFlashcard(cardId, studySetId).catch(() => {
      setCards(prev => prev.map(c =>
        c._id === cardId ? { ...c, suspended: !c.suspended } : c
      ));
    });
  }, [studySetId]);

  const handleEdit = useCallback((card: Flashcard) => {
    setEditCard(card);
    setEditOpen(true);
  }, []);

  function handleNewCard() {
    setEditCard(undefined);
    setEditOpen(true);
  }

  function handleSaved(saved: Flashcard) {
    setCards(prev => {
      const idx = prev.findIndex(c => c._id === saved._id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = saved;
        return next;
      }
      return [saved, ...prev];
    });
  }

  async function handleBulkDelete() {
    const ids = Array.from(bulk.selected);
    await bulkDeleteFlashcards(ids, studySetId).catch(() => {});
    setCards(prev => prev.filter(c => !bulk.selected.has(c._id)));
    bulk.clear();
    setBulkDeleteOpen(false);
  }

  async function handleBulkSuspend() {
    await Promise.allSettled(Array.from(bulk.selected).map(id => suspendFlashcard(id, studySetId)));
    setCards(prev => prev.map(c => bulk.selected.has(c._id) ? { ...c, suspended: true } : c));
    bulk.clear();
  }

  async function handleBulkTag() {
    const tags = bulkTagInput.split(',').map(t => t.trim()).filter(Boolean);
    if (tags.length === 0) return;
    await bulkTagFlashcards(Array.from(bulk.selected), studySetId, tags, bulkTagMode).catch(() => {});
    setCards(prev => prev.map(c => {
      if (!bulk.selected.has(c._id)) return c;
      const next = bulkTagMode === 'add'
        ? [...new Set([...c.tags, ...tags])]
        : c.tags.filter(t => !tags.includes(t));
      return { ...c, tags: next };
    }));
    bulk.clear();
    setBulkTagOpen(false);
    setBulkTagInput('');
  }

  function handleExport() {
    const escape = (v: string) => `"${(v ?? '').replace(/"/g, '""')}"`;
    const lines = [
      'front,back,tags,type,cloze',
      ...cards.map(c =>
        [
          c.front,
          c.back,
          c.tags.join('|'),
          c.cardType,
          c.cardType === 'cloze' ? (c.clozeBody ?? '') : '',
        ].map(escape).join(',')
      ),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    const safeName = studySetName.replace(/[^a-z0-9_\-]+/gi, '_').toLowerCase() || 'flashcards';
    a.href = url;
    a.download = `${safeName}-flashcards.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <>
    <FlashcardEditDialog
      open={editOpen}
      onClose={() => setEditOpen(false)}
      studySetId={studySetId}
      card={editCard}
      tagSuggestions={allTags}
      onSaved={handleSaved}
      onDeleted={editCard ? () => {
        setCards(prev => prev.filter(c => c._id !== editCard._id));
        setEditOpen(false);
      } : undefined}
    />
    <CsvImportDialog
      studySetId={studySetId}
      open={importDialogOpen}
      onClose={() => setImportDialogOpen(false)}
      onImported={() => window.location.reload()}
    />
    {/* Cram Mode filter sheet */}
    <Dialog open={cramSheetOpen} onOpenChange={setCramSheetOpen}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-[hsl(var(--accent))]" aria-hidden="true" />
            Cram Mode
          </DialogTitle>
          <DialogDescription>
            Drill cards without affecting your SM-2 schedule.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2 mt-2">
          {[
            { label: 'All cards', description: 'Review every non-suspended card', filter: '' },
            { label: 'Due cards only', description: 'Only cards due today', filter: 'due' },
            { label: `Tag filter: ${tagFilters.join(', ') || 'none'}`, description: tagFilters.length > 0 ? `${tagFilters.length} tag${tagFilters.length !== 1 ? 's' : ''} selected` : 'Apply tag filters first in the deck list', filter: 'tag', disabled: tagFilters.length === 0 },
          ].map(opt => (
            <button
              key={opt.label}
              disabled={opt.disabled}
              onClick={() => {
                setCramSheetOpen(false);
                router.push(`/sets/${studySetId}/flashcards/review?cram=true`);
              }}
              className={cn(
                'flex flex-col items-start rounded-lg border border-border bg-surface-2 px-4 py-3 text-left transition-colors',
                opt.disabled
                  ? 'opacity-40 cursor-not-allowed'
                  : 'hover:border-primary/40 hover:bg-primary/5 cursor-pointer'
              )}
            >
              <span className="text-sm font-medium text-foreground">{opt.label}</span>
              <span className="text-xs text-foreground-muted mt-0.5">{opt.description}</span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
    <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {bulk.count} card{bulk.count !== 1 ? 's' : ''}?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently delete {bulk.count} flashcard{bulk.count !== 1 ? 's' : ''}. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleBulkDelete}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    <Dialog open={bulkTagOpen} onOpenChange={v => { if (!v) { setBulkTagOpen(false); setBulkTagInput(''); } }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{bulkTagMode === 'add' ? 'Add tags to' : 'Remove tags from'} {bulk.count} card{bulk.count !== 1 ? 's' : ''}</DialogTitle>
        </DialogHeader>
        <div className="mt-4 flex flex-col gap-4">
          <div className="flex gap-2">
            <button
              onClick={() => setBulkTagMode('add')}
              className={cn('flex-1 rounded-md border px-3 py-1.5 text-xs cursor-pointer transition-colors', bulkTagMode === 'add' ? 'border-primary text-primary bg-primary-soft' : 'border-border text-foreground-muted hover:text-foreground')}
            >Add</button>
            <button
              onClick={() => setBulkTagMode('remove')}
              className={cn('flex-1 rounded-md border px-3 py-1.5 text-xs cursor-pointer transition-colors', bulkTagMode === 'remove' ? 'border-primary text-primary bg-primary-soft' : 'border-border text-foreground-muted hover:text-foreground')}
            >Remove</button>
          </div>
          <input
            type="text"
            value={bulkTagInput}
            onChange={e => setBulkTagInput(e.target.value)}
            placeholder="e.g. chapter-4, important"
            autoFocus
            className="h-9 w-full rounded-md border border-border bg-surface-2 px-3 text-sm text-foreground placeholder:text-foreground-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          />
          <p className="text-xs text-foreground-muted">Separate multiple tags with commas.</p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => { setBulkTagOpen(false); setBulkTagInput(''); }}>Cancel</Button>
            <Button onClick={handleBulkTag} disabled={!bulkTagInput.trim()}>Apply</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    <div className="px-content-x py-8 max-w-4xl mx-auto">
      {/* Deck header */}
      <div className="flex items-center gap-4 mb-section-y">
        <div className="flex-1 min-w-0">
          <h1 className="text-h1 text-foreground truncate">{studySetName}</h1>
          <div className="flex items-center gap-3 mt-1 text-sm text-foreground-muted">
            <span className="font-mono">{cards.length} card{cards.length !== 1 ? 's' : ''}</span>
            {dueCount > 0 && <span className="font-mono text-danger">{dueCount} due</span>}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 relative">
          {dueCount > 0 ? (
            <Button asChild>
              <Link href={`/sets/${studySetId}/flashcards/review`}>
                <Play className="h-4 w-4" aria-hidden="true" />
                Start Review
                <kbd className="ml-1 text-[10px] opacity-60 font-sans">⌘R</kbd>
              </Link>
            </Button>
          ) : (
            <Button asChild variant="outline" title="No cards due — cram drills the whole deck without affecting the schedule">
              <Link href={`/sets/${studySetId}/flashcards/review?cram=true`}>
                <Zap className="h-4 w-4" aria-hidden="true" />
                Cram all cards
              </Link>
            </Button>
          )}
          {showCramHint && (
            <FirstTimeHint
              hintId="hint:cram-mode"
              content="⌘⇧C for Cram Mode — drill cards without affecting SM-2"
              position="bottom"
            />
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" aria-label="More options">
                <MoreHorizontal size={16} aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setImportDialogOpen(true)}>Import CSV</DropdownMenuItem>
              <DropdownMenuItem onSelect={handleExport} disabled={cards.length === 0}>Export CSV</DropdownMenuItem>
              <DropdownMenuItem>Generate from PDF</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href={`/sets/${studySetId}/flashcards/batch-review`}>
                  Batch Review
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={`/sets/${studySetId}/flashcards/review?cram=true`}>
                  Cram Mode
                  <kbd className="ml-auto text-[10px] opacity-60 font-sans">⌘⇧C</kbd>
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Sticky filter bar */}
      <div className="sticky top-11 z-10 bg-background -mx-content-x px-content-x border-b border-border pt-3 pb-3 mb-4 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          {/* Status pills */}
          <div role="group" aria-label="Filter by status" className="flex gap-1 bg-surface-2 rounded-md p-0.5">
            {STATUS_FILTERS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setStatus(key)}
                className={cn(
                  'rounded px-2.5 py-1 text-xs font-medium capitalize transition-colors cursor-pointer',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
                  status === key
                    ? 'bg-primary-soft text-primary shadow-sm'
                    : 'text-foreground-muted hover:text-foreground'
                )}
                aria-pressed={status === key}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Tag filter */}
          <div className="relative">
            <button
              onClick={() => setTagDropOpen(v => !v)}
              className={cn(
                'flex items-center gap-1.5 rounded-md border border-border bg-surface-2 px-2.5 py-1 text-xs text-foreground-muted hover:text-foreground cursor-pointer',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
                tagFilters.length > 0 && 'border-primary/50 text-primary'
              )}
              aria-haspopup="listbox"
              aria-expanded={tagDropOpen}
            >
              <Tag className="h-3.5 w-3.5" aria-hidden="true" />
              Tag {tagFilters.length > 0 && `(${tagFilters.length})`}
              <ChevronDown className="h-3 w-3" aria-hidden="true" />
            </button>
            {tagDropOpen && allTags.length > 0 && (
              <div className="absolute top-full left-0 mt-1 z-50 rounded-md border border-border bg-background shadow-lg min-w-40">
                {allTags.map(tag => (
                  <label key={tag} className="flex items-center gap-2 px-3 py-2 text-xs cursor-pointer hover:bg-surface-2">
                    <input
                      type="checkbox"
                      checked={tagFilters.includes(tag)}
                      onChange={() => setTagFilters(prev =>
                        prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
                      )}
                      className="accent-primary"
                    />
                    {tag}
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Source filter */}
          {allSources.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setSourceDropOpen(v => !v)}
                className={cn(
                  'flex items-center gap-1.5 rounded-md border border-border bg-surface-2 px-2.5 py-1 text-xs text-foreground-muted hover:text-foreground cursor-pointer',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
                  sourceFilter && 'border-primary/50 text-primary'
                )}
                aria-haspopup="listbox"
                aria-expanded={sourceDropOpen}
              >
                Source
                <ChevronDown className="h-3 w-3" aria-hidden="true" />
              </button>
              {sourceDropOpen && (
                <div className="absolute top-full left-0 mt-1 z-50 rounded-md border border-border bg-background shadow-lg min-w-48">
                  <button
                    onClick={() => { setSourceFilter(''); setSourceDropOpen(false); }}
                    className={cn('w-full text-left px-3 py-2 text-xs hover:bg-surface-2 transition-colors', !sourceFilter && 'text-primary font-medium')}
                  >
                    All sources
                  </button>
                  {allSources.map(src => (
                    <button
                      key={src}
                      onClick={() => { setSourceFilter(src); setSourceDropOpen(false); }}
                      className={cn('w-full text-left px-3 py-2 text-xs hover:bg-surface-2 transition-colors truncate', sourceFilter === src && 'text-primary font-medium')}
                    >
                      {src}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Search toggle */}
          <button
            onClick={() => setSearchOpen(v => !v)}
            className={cn(
              'flex items-center justify-center h-7 w-7 rounded-md border border-border bg-surface-2 cursor-pointer',
              'text-foreground-muted hover:text-foreground transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
              (searchOpen || search) && 'border-primary/50 text-primary'
            )}
            aria-label="Search cards"
            aria-pressed={searchOpen}
          >
            <Search className="h-3.5 w-3.5" aria-hidden="true" />
          </button>

          {/* Sort + Add card */}
          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-1.5 shrink-0 text-xs h-7" onClick={handleNewCard}>
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Add card
            </Button>
            <select
              value={sort}
              onChange={e => setSort(e.target.value as SortKey)}
              className="rounded-md border border-border bg-surface-2 px-2.5 py-1 text-xs text-foreground cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
              aria-label="Sort cards"
            >
              <option value="created">Recently created</option>
              <option value="reviewed">Recently reviewed</option>
              <option value="difficulty-asc">Ease ↑</option>
              <option value="difficulty-desc">Ease ↓</option>
              <option value="alpha">Alphabetical</option>
            </select>
          </div>
        </div>

        {/* Inline search (appears when search icon clicked) */}
        {searchOpen && (
          <div className="flex items-center gap-2 rounded-md border border-border bg-surface-2 px-3 py-2 focus-within:ring-2 focus-within:ring-focus-ring">
            <Search className="h-4 w-4 text-foreground-subtle shrink-0" aria-hidden="true" />
            <input
              type="search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search cards…"
              className="flex-1 bg-transparent text-sm text-foreground placeholder:text-foreground-subtle outline-none"
              aria-label="Search flashcards"
              autoFocus
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="text-foreground-subtle hover:text-foreground cursor-pointer"
                aria-label="Clear search"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </div>
        )}

        {/* Active filter chips row */}
        {(tagFilters.length > 0 || sourceFilter) && (
          <div className="flex flex-wrap items-center gap-1.5">
            {tagFilters.map(t => (
              <span key={t} className="inline-flex items-center gap-1 text-[11px] bg-primary-soft text-primary px-1.5 py-0.5 rounded-[3px]">
                {t}
                <button
                  type="button"
                  onClick={() => setTagFilters(prev => prev.filter(f => f !== t))}
                  className="hover:opacity-70 cursor-pointer"
                  aria-label={`Remove ${t} filter`}
                >
                  <X className="h-3 w-3" aria-hidden="true" />
                </button>
              </span>
            ))}
            {sourceFilter && (
              <span className="inline-flex items-center gap-1 text-[11px] bg-surface-3 text-foreground-muted px-1.5 py-0.5 rounded-[3px]">
                {sourceFilter}
                <button
                  type="button"
                  onClick={() => setSourceFilter('')}
                  className="hover:opacity-70 cursor-pointer"
                  aria-label="Remove source filter"
                >
                  <X className="h-3 w-3" aria-hidden="true" />
                </button>
              </span>
            )}
          </div>
        )}
      </div>

      {/* Card list */}
      {cards.length === 0 ? (
        <EmptyState
          icon={<Layers className="h-6 w-6" aria-hidden="true" />}
          headline="No flashcards yet."
          subline="Generate from a PDF, import a CSV, or write one yourself."
          action={
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button asChild variant="outline">
                <Link href={`/sets/${studySetId}`}>
                  <FileText className="h-4 w-4 mr-1" aria-hidden="true" />
                  Generate from PDF
                </Link>
              </Button>
              <Button variant="outline" onClick={() => setImportDialogOpen(true)}>
                <FileUp className="h-4 w-4 mr-1" aria-hidden="true" />
                Import CSV
              </Button>
              <Button onClick={handleNewCard}>
                <Plus className="h-4 w-4 mr-1" aria-hidden="true" />
                Create manually
              </Button>
            </div>
          }
        />
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center">
          <p className="text-sm text-foreground-muted">No cards match your filters.</p>
          <button
            onClick={() => { setSearch(''); setStatus('all'); setTagFilters([]); setSourceFilter(''); }}
            className="mt-2 text-xs text-primary hover:underline cursor-pointer"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-0.5" role="list" aria-label="Flashcards">
          {/* Select-all row */}
          <div className="flex items-center gap-3 px-4 py-2">
            <input
              type="checkbox"
              checked={bulk.count === filtered.length && filtered.length > 0}
              onChange={() => { if (bulk.count === filtered.length) bulk.clear(); else bulk.selectAll(); }}
              className="accent-primary cursor-pointer"
              aria-label="Select all"
            />
            <span className="text-xs text-foreground-subtle">
              {filtered.length} card{filtered.length !== 1 ? 's' : ''}
              {bulk.count > 0 && ` · ${bulk.count} selected`}
            </span>
          </div>

          <div ref={listRef} className="flex flex-col gap-0 relative">
            {filtered.map(card => (
              <div key={card._id} role="listitem">
                <CardRow
                  card={card}
                  selected={bulk.isSelected(card._id)}
                  onToggleSelect={toggleSelect}
                  onEdit={handleEdit}
                  onSuspend={handleSuspend}
                  onDelete={handleDelete}
                />
              </div>
            ))}
            <Marquee containerRef={listRef} onSelect={(ids, mode) => bulk.selectIds(ids, mode)} />
          </div>
        </div>
      )}

      {/* Bulk action bar */}
      {bulk.count > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 rounded-xl border border-border bg-surface shadow-lg px-4 py-2.5" role="toolbar" aria-label="Bulk actions">
          <span className="text-sm font-medium text-foreground mr-2">{bulk.count} selected</span>
          <Button size="sm" variant="outline" className="text-xs h-7" onClick={handleBulkSuspend}>
            Suspend
          </Button>
          <Button size="sm" variant="outline" className="text-xs h-7 gap-1.5" onClick={() => setBulkTagOpen(true)}>
            <Tag className="h-3.5 w-3.5" aria-hidden="true" />
            Tag
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="text-xs h-7 text-destructive border-destructive/30 hover:bg-destructive/10"
            onClick={() => setBulkDeleteOpen(true)}
          >
            Delete
          </Button>
          <button
            type="button"
            onClick={bulk.clear}
            className="ml-1 text-foreground-muted hover:text-foreground cursor-pointer"
            aria-label="Clear selection"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
    </>
  );
}
