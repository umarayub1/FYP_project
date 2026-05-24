'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { ArrowLeft, ChevronDown, Download, X, Loader2 } from 'lucide-react';
import {
  type Flashcard,
  updateFlashcard,
  deleteFlashcard,
  suspendFlashcard,
} from '@/lib/api/flashcards';
import { FlashcardEditDialog } from './FlashcardEditDialog';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/cn';
import { formatRelative } from '@/lib/format/date';

type FilterMode = 'all' | 'due' | 'leech' | 'suspended';

interface BatchReviewTableProps {
  studySetId: string;
  studySetName: string;
  initialCards: Flashcard[];
}

function easeColor(ease?: number): string {
  if (ease == null) return 'text-foreground-muted';
  if (ease < 1.8) return 'text-[hsl(var(--danger))]';
  if (ease < 2.3) return 'text-[hsl(var(--warning))]';
  return 'text-foreground';
}

function dueLabelAndClass(dueDate?: string): { label: string; cls: string } {
  if (!dueDate) return { label: 'New', cls: 'text-foreground-muted' };
  const now = Date.now();
  const due = new Date(dueDate).getTime();
  if (due < now - 3_600_000) return { label: 'Overdue', cls: 'text-[hsl(var(--danger))]' };
  if (due < now + 86_400_000) return { label: 'Today', cls: 'text-[hsl(var(--warning))]' };
  return { label: formatRelative(dueDate), cls: 'text-foreground-muted' };
}

export function BatchReviewTable({ studySetId, studySetName, initialCards }: BatchReviewTableProps) {
  const [cards, setCards]                   = useState(initialCards);
  const [selected, setSelected]             = useState<Set<string>>(new Set());
  const [filterMode, setFilterMode]         = useState<FilterMode>('all');
  const [tagFilter, setTagFilter]           = useState<string | null>(null);
  const [filterOpen, setFilterOpen]         = useState(false);
  const [editCard, setEditCard]             = useState<Flashcard | undefined>(undefined);
  const [editOpen, setEditOpen]             = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [editingCell, setEditingCell]       = useState<{ cardId: string; field: 'front' | 'back' } | null>(null);
  const [editingValue, setEditingValue]     = useState('');
  const [savingCells, setSavingCells]       = useState<Set<string>>(new Set());

  const allTags = useMemo(() => {
    const s = new Set<string>();
    cards.forEach(c => c.tags.forEach(t => s.add(t)));
    return Array.from(s).sort();
  }, [cards]);

  const filtered = useMemo(() => {
    let r = cards;
    const nowIso = new Date().toISOString();
    if (filterMode === 'due')       r = r.filter(c => !c.dueDate || c.dueDate <= nowIso);
    if (filterMode === 'leech')     r = r.filter(c => !!c.isLeech);
    if (filterMode === 'suspended') r = r.filter(c => !!c.suspended);
    if (tagFilter)                  r = r.filter(c => c.tags.includes(tagFilter));
    return r;
  }, [cards, filterMode, tagFilter]);

  function toggleSelect(id: string) {
    setSelected(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  function startEditing(card: Flashcard, field: 'front' | 'back') {
    setEditingCell({ cardId: card._id, field });
    setEditingValue(field === 'front' ? card.front : card.back);
  }

  async function saveCell(cellCardId: string, cellField: 'front' | 'back', value: string) {
    const original = cards.find(c => c._id === cellCardId);
    if (!original) return;
    const originalValue = cellField === 'front' ? original.front : original.back;
    if (value === originalValue) return;
    const cellKey = `${cellCardId}:${cellField}`;
    setSavingCells(prev => new Set(prev).add(cellKey));
    setCards(prev => prev.map(c => c._id === cellCardId ? { ...c, [cellField]: value } : c));
    try {
      await updateFlashcard(cellCardId, studySetId, { [cellField]: value });
    } catch {
      setCards(prev => prev.map(c => c._id === cellCardId ? { ...c, [cellField]: originalValue } : c));
    } finally {
      setSavingCells(prev => { const n = new Set(prev); n.delete(cellKey); return n; });
    }
  }

  function handleCellBlur() {
    if (!editingCell) return;
    const { cardId, field } = editingCell;
    const val = editingValue;
    setEditingCell(null);
    saveCell(cardId, field, val);
  }

  function handleCellKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (!editingCell) return;
      const { cardId, field } = editingCell;
      const val = editingValue;
      setEditingCell(null);
      saveCell(cardId, field, val);
    }
    if (e.key === 'Escape') {
      setEditingCell(null);
    }
  }

  async function handleDelete(cardId: string) {
    await deleteFlashcard(cardId, studySetId).catch(() => {});
    setCards(prev => prev.filter(c => c._id !== cardId));
    setSelected(prev => { const n = new Set(prev); n.delete(cardId); return n; });
    setDeleteConfirmId(null);
  }

  async function handleSuspend(cardId: string) {
    setCards(prev => prev.map(c => c._id === cardId ? { ...c, suspended: !c.suspended } : c));
    await suspendFlashcard(cardId, studySetId).catch(() => {
      setCards(prev => prev.map(c => c._id === cardId ? { ...c, suspended: !c.suspended } : c));
    });
  }

  function handleSaved(saved: Flashcard) {
    setCards(prev => {
      const idx = prev.findIndex(c => c._id === saved._id);
      if (idx >= 0) { const n = [...prev]; n[idx] = saved; return n; }
      return [saved, ...prev];
    });
  }

  async function handleBulkDelete() {
    await Promise.allSettled(Array.from(selected).map(id => deleteFlashcard(id, studySetId)));
    setCards(prev => prev.filter(c => !selected.has(c._id)));
    setSelected(new Set());
    setBulkDeleteOpen(false);
  }

  async function handleBulkSuspend() {
    await Promise.allSettled(Array.from(selected).map(id => suspendFlashcard(id, studySetId)));
    setCards(prev => prev.map(c => selected.has(c._id) ? { ...c, suspended: true } : c));
    setSelected(new Set());
  }

  function exportCSV(toExport: Flashcard[]) {
    const header = 'front,back,tags,ease,interval';
    const rows = toExport.map(c => [
      `"${c.front.replace(/"/g, '""')}"`,
      `"${c.back.replace(/"/g, '""')}"`,
      `"${(c.tags ?? []).join(';').replace(/"/g, '""')}"`,
      c.easeFactor != null ? c.easeFactor.toFixed(2) : '',
      c.interval ?? '',
    ].join(','));
    const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${studySetName.toLowerCase().replace(/\s+/g, '-')}-flashcards.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const filterLabel =
    tagFilter        ? `Tag: ${tagFilter}` :
    filterMode === 'due'       ? 'Due today' :
    filterMode === 'leech'     ? 'Leeches only' :
    filterMode === 'suspended' ? 'Suspended' :
    'All cards';

  const allSelected = filtered.length > 0 && selected.size === filtered.length;

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

      {/* Single-card delete confirm */}
      <AlertDialog open={!!deleteConfirmId} onOpenChange={open => { if (!open) setDeleteConfirmId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete card?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this flashcard. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteConfirmId && handleDelete(deleteConfirmId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk delete confirm */}
      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selected.size} card{selected.size !== 1 ? 's' : ''}?</AlertDialogTitle>
            <AlertDialogDescription>
              Permanently delete {selected.size} flashcard{selected.size !== 1 ? 's' : ''}. This cannot be undone.
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

      <div className="px-content-x py-8 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6 flex-wrap">
          <Button asChild variant="ghost" size="sm" className="gap-1.5 text-foreground-muted hover:text-foreground -ml-2">
            <Link href={`/sets/${studySetId}/flashcards`}>
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Back to Deck
            </Link>
          </Button>
          <div className="h-4 w-px bg-border shrink-0" />
          <h1 className="text-h1 text-foreground">Batch Review</h1>
          <span className="font-mono text-sm text-foreground-muted">
            {filtered.length} card{filtered.length !== 1 ? 's' : ''}
          </span>
          <div className="ml-auto flex items-center gap-2">
            {/* Filter dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setFilterOpen(v => !v)}
                className="flex items-center gap-1.5 rounded-md border border-border bg-surface-2 px-3 py-1.5 text-xs text-foreground-muted hover:text-foreground cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                aria-haspopup="listbox"
                aria-expanded={filterOpen}
                aria-label="Filter cards"
              >
                {filterLabel}
                <ChevronDown className="h-3 w-3" aria-hidden="true" />
              </button>
              {filterOpen && (
                <div
                  className="absolute right-0 top-full mt-1 z-50 w-48 rounded-md border border-border bg-background shadow-lg py-1"
                  role="listbox"
                >
                  {([ ['all', 'All cards'], ['due', 'Due today'], ['leech', 'Leeches only'], ['suspended', 'Suspended'] ] as [FilterMode, string][]).map(([mode, label]) => (
                    <button
                      key={mode}
                      type="button"
                      role="option"
                      aria-selected={filterMode === mode && !tagFilter}
                      onClick={() => { setFilterMode(mode); setTagFilter(null); setFilterOpen(false); }}
                      className={cn(
                        'w-full text-left px-3 py-1.5 text-xs hover:bg-surface-2 transition-colors',
                        filterMode === mode && !tagFilter ? 'text-primary font-medium' : 'text-foreground'
                      )}
                    >
                      {label}
                    </button>
                  ))}
                  {allTags.length > 0 && (
                    <>
                      <div className="my-1 h-px bg-border mx-2" />
                      {allTags.map(tag => (
                        <button
                          key={tag}
                          type="button"
                          role="option"
                          aria-selected={tagFilter === tag}
                          onClick={() => { setFilterMode('all'); setTagFilter(tag); setFilterOpen(false); }}
                          className={cn(
                            'w-full text-left px-3 py-1.5 text-xs hover:bg-surface-2 transition-colors truncate',
                            tagFilter === tag ? 'text-primary font-medium' : 'text-foreground'
                          )}
                        >
                          Tag: {tag}
                        </button>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>

            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs h-8"
              onClick={() => exportCSV(filtered)}
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              Export CSV
            </Button>
          </div>
        </div>

        {/* Bulk action bar */}
        {selected.size > 0 && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2.5 flex-wrap">
            <span className="text-sm font-medium text-foreground mr-1">
              {selected.size} selected
            </span>
            <Button size="sm" variant="outline" className="text-xs h-7" onClick={handleBulkSuspend}>
              Suspend selected
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-xs h-7 text-destructive border-destructive/30 hover:bg-destructive/10"
              onClick={() => setBulkDeleteOpen(true)}
            >
              Delete selected
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-xs h-7"
              onClick={() => exportCSV(cards.filter(c => selected.has(c._id)))}
            >
              Export selected
            </Button>
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="ml-auto text-foreground-muted hover:text-foreground cursor-pointer"
              aria-label="Clear selection"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        )}

        {/* Table */}
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-2">
                <th scope="col" className="w-10 px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={() => allSelected
                      ? setSelected(new Set())
                      : setSelected(new Set(filtered.map(c => c._id)))
                    }
                    className="accent-primary"
                    aria-label="Select all visible cards"
                  />
                </th>
                <th scope="col" className="px-3 py-2.5 text-left text-[11px] font-medium uppercase tracking-wide text-foreground-subtle">
                  Front
                </th>
                <th scope="col" className="px-3 py-2.5 text-left text-[11px] font-medium uppercase tracking-wide text-foreground-subtle">
                  Back
                </th>
                <th scope="col" className="w-20 px-3 py-2.5 text-left text-[11px] font-medium uppercase tracking-wide text-foreground-subtle">
                  Ease
                </th>
                <th scope="col" className="w-28 px-3 py-2.5 text-left text-[11px] font-medium uppercase tracking-wide text-foreground-subtle">
                  Next Due
                </th>
                <th scope="col" className="w-24 px-3 py-2.5 text-right text-[11px] font-medium uppercase tracking-wide text-foreground-subtle">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-sm text-foreground-muted">
                    No cards match your filter.
                  </td>
                </tr>
              ) : (
                filtered.map(card => {
                  const { label: dueLabel, cls: dueClass } = dueLabelAndClass(card.dueDate);
                  const isEditingFront = editingCell?.cardId === card._id && editingCell.field === 'front';
                  const isEditingBack  = editingCell?.cardId === card._id && editingCell.field === 'back';
                  const savingFront    = savingCells.has(`${card._id}:front`);
                  const savingBack     = savingCells.has(`${card._id}:back`);

                  return (
                    <tr
                      key={card._id}
                      className="border-b border-border last:border-0 hover:bg-surface-2/50 transition-colors group"
                    >
                      {/* Checkbox */}
                      <td className="w-10 px-3 py-2.5">
                        <input
                          type="checkbox"
                          checked={selected.has(card._id)}
                          onChange={() => toggleSelect(card._id)}
                          className="accent-primary"
                          aria-label={`Select: ${card.front.slice(0, 40)}`}
                        />
                      </td>

                      {/* Front */}
                      <td
                        className="px-3 py-2 max-w-[260px] cursor-text"
                        onClick={() => { if (!isEditingFront) startEditing(card, 'front'); }}
                      >
                        {isEditingFront ? (
                          <input
                            autoFocus
                            value={editingValue}
                            onChange={e => setEditingValue(e.target.value)}
                            onBlur={handleCellBlur}
                            onKeyDown={handleCellKeyDown}
                            className="w-full bg-transparent text-[13px] text-foreground outline-none border-b border-primary"
                          />
                        ) : (
                          <div className="flex items-center gap-1.5 min-w-0">
                            {savingFront && (
                              <Loader2 className="h-3 w-3 shrink-0 animate-spin text-foreground-muted" aria-hidden="true" />
                            )}
                            {card.isLeech && (
                              <span className="shrink-0 text-[10px] font-medium bg-[hsl(var(--danger-soft))] text-[hsl(var(--danger))] px-1 py-0.5 rounded-[3px]">
                                Leech
                              </span>
                            )}
                            <span className={cn(
                              'text-[13px] text-foreground truncate',
                              card.suspended && 'line-through text-foreground-muted'
                            )}>
                              {card.front}
                            </span>
                          </div>
                        )}
                      </td>

                      {/* Back */}
                      <td
                        className="px-3 py-2 max-w-[260px] cursor-text"
                        onClick={() => { if (!isEditingBack) startEditing(card, 'back'); }}
                      >
                        {isEditingBack ? (
                          <input
                            autoFocus
                            value={editingValue}
                            onChange={e => setEditingValue(e.target.value)}
                            onBlur={handleCellBlur}
                            onKeyDown={handleCellKeyDown}
                            className="w-full bg-transparent text-[13px] text-foreground outline-none border-b border-primary"
                          />
                        ) : (
                          <div className="flex items-center gap-1.5 min-w-0">
                            {savingBack && (
                              <Loader2 className="h-3 w-3 shrink-0 animate-spin text-foreground-muted" aria-hidden="true" />
                            )}
                            <span className="text-[13px] text-foreground-muted truncate">
                              {card.back}
                            </span>
                          </div>
                        )}
                      </td>

                      {/* Ease */}
                      <td className="w-20 px-3 py-2.5">
                        <span className={cn('font-mono text-xs', easeColor(card.easeFactor))}>
                          {card.easeFactor != null ? card.easeFactor.toFixed(2) : '—'}
                        </span>
                      </td>

                      {/* Next Due */}
                      <td className="w-28 px-3 py-2.5">
                        <span className={cn('font-mono text-xs', dueClass)}>
                          {dueLabel}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="w-24 px-3 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            type="button"
                            onClick={() => { setEditCard(card); setEditOpen(true); }}
                            className="px-1.5 py-0.5 text-[11px] text-foreground-muted hover:text-foreground rounded hover:bg-surface-3 transition-colors cursor-pointer"
                            aria-label={`Edit: ${card.front.slice(0, 30)}`}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteConfirmId(card._id)}
                            className="px-1.5 py-0.5 text-[11px] text-[hsl(var(--danger))] rounded hover:bg-[hsl(var(--danger-soft))] transition-colors cursor-pointer"
                            aria-label={`Delete: ${card.front.slice(0, 30)}`}
                          >
                            ⊗
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
