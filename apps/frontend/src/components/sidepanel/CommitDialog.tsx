'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Sparkles, FileText, BookOpen, Plus } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { toast } from 'sonner';
import type {
  StagedCard,
  StagedCornellRow,
} from '@/contexts/StagingContext';
import { createFlashcard } from '@/lib/api/flashcards';
import {
  appendToNote,
  createNote,
  getNotes,
  updateNote,
  type Note,
} from '@/lib/api/notes';
import { useAIStatus, detectAIErrorReason } from '@/contexts/AIStatusContext';

type CommitKind = 'cards' | 'cornell-rows';

interface CommitDialogProps {
  open:        boolean;
  kind:        CommitKind;
  studySetId?: string;
  items:       (StagedCard | StagedCornellRow)[];
  onClose:     () => void;
  onCommitted: () => void;
}

type Destination = 'new-flashcards' | 'append-note' | 'new-note';

function buildBlocks(items: (StagedCard | StagedCornellRow)[]): unknown[] {
  return items.map(item => {
    const text = 'text' in item ? item.text : `${item.front} — ${item.back}`;
    return {
      type: 'paragraph',
      content: [{ type: 'text', text }],
    };
  });
}

export function CommitDialog({
  open, kind, studySetId, items, onClose, onCommitted,
}: CommitDialogProps) {
  const [destination, setDestination] = useState<Destination>(
    kind === 'cards' ? 'new-flashcards' : 'new-note',
  );
  const [committing, setCommitting] = useState(false);
  const [notes, setNotes] = useState<Note[]>([]);
  const [targetNoteId, setTargetNoteId] = useState<string>('');
  const [newNoteTitle, setNewNoteTitle] = useState<string>('Staged notes');
  const [manualEditOpen, setManualEditOpen] = useState(false);
  const [editedText, setEditedText] = useState<string>('');
  const [refining, setRefining] = useState(false);
  const [refinedText, setRefinedText] = useState<string | null>(null);
  const [useRefined, setUseRefined] = useState(false);

  const { setUnavailable, setAvailable } = useAIStatus();
  const abortRef = useRef<AbortController | null>(null);

  // Reset state when the dialog flips open with new staged items.
  useEffect(() => {
    if (!open) return;
    setDestination(kind === 'cards' ? 'new-flashcards' : 'new-note');
    setCommitting(false);
    setManualEditOpen(false);
    setRefinedText(null);
    setUseRefined(false);
    setNewNoteTitle('Staged notes');
    // Seed manual-edit textarea with a flattened view of the staged items.
    const flat = items.map(it => 'text' in it ? it.text : `${it.front}\n${it.back}`).join('\n\n---\n\n');
    setEditedText(flat);
    if (!studySetId) return;
    getNotes(studySetId)
      .then(list => {
        setNotes(list);
        if (list.length > 0) setTargetNoteId(list[0]._id);
      })
      .catch(() => setNotes([]));
    return () => { abortRef.current?.abort(); abortRef.current = null; };
  }, [open, studySetId, kind, items]);

  const effectiveItems = useMemo(() => {
    if (manualEditOpen && editedText.trim()) {
      // Split on `---` separators so the user can keep multiple items.
      const chunks = editedText
        .split(/\n+---+\n+/)
        .map(s => s.trim())
        .filter(Boolean);
      if (kind === 'cards') {
        return chunks.map((text, i) => {
          const split = text.split(/\n+/, 2);
          return {
            id: `edited-${i}`,
            front: split[0] ?? text,
            back:  split[1] ?? text,
            studySetId: studySetId ?? '',
          } as StagedCard;
        });
      }
      return chunks.map((text, i) => ({
        id: `edited-${i}`,
        text,
        studySetId: studySetId ?? '',
      } as StagedCornellRow));
    }
    return items;
  }, [items, manualEditOpen, editedText, kind, studySetId]);

  async function handleAIRefine() {
    if (!studySetId || refining) return;
    const sourceText = useRefined && refinedText
      ? refinedText
      : effectiveItems.map(it => 'text' in it ? it.text : `${it.front} — ${it.back}`).join('\n\n');
    if (!sourceText.trim()) return;
    setRefining(true);
    setRefinedText('');
    const abort = new AbortController();
    abortRef.current = abort;
    try {
      const res = await fetch('/api/ai/note-action', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        signal:  abort.signal,
        body:    JSON.stringify({ action: 'summarize', text: sourceText, studySetId }),
      });
      if (!res.ok || !res.body) {
        setUnavailable(detectAIErrorReason(res.status));
        throw new Error(`Refine failed: ${res.status}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let accumulated = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n');
        buffer = parts.pop() ?? '';
        for (const line of parts) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6);
          if (raw === '[DONE]') continue;
          try {
            const parsed = JSON.parse(raw);
            if (parsed.token) {
              accumulated += parsed.token;
              setRefinedText(accumulated);
            }
          } catch { /* skip */ }
        }
      }
      setAvailable();
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        toast.error('Refine failed — using original text.');
        setRefinedText(null);
      }
    } finally {
      setRefining(false);
    }
  }

  async function handleCommit() {
    if (!studySetId || committing) return;
    setCommitting(true);
    try {
      let finalItems = effectiveItems;
      if (useRefined && refinedText) {
        // Re-flatten the refined text as a single staged item per kind.
        finalItems = kind === 'cards'
          ? [{
              id: 'refined',
              front: refinedText.split('\n')[0] ?? refinedText,
              back: refinedText,
              studySetId,
            } as StagedCard]
          : [{
              id: 'refined',
              text: refinedText,
              studySetId,
            } as StagedCornellRow];
      }

      if (destination === 'new-flashcards' && kind === 'cards') {
        for (const card of finalItems as StagedCard[]) {
          await createFlashcard(studySetId, {
            front: card.front,
            back:  card.back,
            cardType: 'basic',
            sourceTitle: card.sourceTitle,
            sourcePage:  card.sourcePage,
          }).catch(() => {});
        }
        toast.success(`Committed ${finalItems.length} flashcard${finalItems.length !== 1 ? 's' : ''}.`);
      } else if (destination === 'append-note') {
        if (!targetNoteId) {
          toast.error('Pick a note to append to.');
          setCommitting(false);
          return;
        }
        const blocks = buildBlocks(finalItems);
        await appendToNote(targetNoteId, studySetId, blocks);
        toast.success(`Appended ${finalItems.length} block${finalItems.length !== 1 ? 's' : ''} to note.`);
      } else if (destination === 'new-note') {
        const created = await createNote(studySetId, newNoteTitle.trim() || 'Staged notes');
        const blocks = buildBlocks(finalItems);
        await updateNote(created._id, studySetId, {
          content: { type: 'doc', content: blocks },
        });
        toast.success(`Created note &ldquo;${created.title}&rdquo;.`);
      } else if (destination === 'new-flashcards' && kind === 'cornell-rows') {
        // Cornell rows + "new flashcards" path: split each row into front/back via " — ".
        for (const row of finalItems as StagedCornellRow[]) {
          const [front, ...rest] = row.text.split(/[—:?.]\s+/);
          await createFlashcard(studySetId, {
            front: front.trim() || row.text,
            back:  rest.join(' ').trim() || row.text,
            cardType: 'basic',
            sourceTitle: row.sourceTitle,
            sourcePage:  row.sourcePage,
          }).catch(() => {});
        }
        toast.success(`Committed ${finalItems.length} flashcard${finalItems.length !== 1 ? 's' : ''}.`);
      }

      onCommitted();
      onClose();
    } catch {
      toast.error('Commit failed.');
    } finally {
      setCommitting(false);
    }
  }

  // ⌘⏎ commits.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        void handleCommit();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, destination, targetNoteId, newNoteTitle, manualEditOpen, editedText, useRefined, refinedText]);

  const title = kind === 'cards'
    ? `Commit ${items.length} staged card${items.length !== 1 ? 's' : ''}`
    : `Commit ${items.length} staged block${items.length !== 1 ? 's' : ''}`;

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Pick a destination and optionally refine the text before saving.
          </DialogDescription>
        </DialogHeader>

        {/* Destination chooser */}
        <fieldset className="space-y-2 py-2">
          <legend className="text-xs font-medium text-foreground-muted mb-1">Destination</legend>

          <DestinationRadio
            icon={<BookOpen className="h-3.5 w-3.5" />}
            label="Create as new flashcards"
            value="new-flashcards"
            selected={destination}
            onSelect={setDestination}
            disabledReason={kind === 'cornell-rows' ? 'Will split each block at " — " / colon' : undefined}
          />
          <DestinationRadio
            icon={<FileText className="h-3.5 w-3.5" />}
            label="Append to existing note"
            value="append-note"
            selected={destination}
            onSelect={setDestination}
          />
          {destination === 'append-note' && (
            <div className="ml-6 mt-2">
              {notes.length === 0 ? (
                <p className="text-xs text-foreground-subtle">No notes in this set yet.</p>
              ) : (
                <select
                  value={targetNoteId}
                  onChange={e => setTargetNoteId(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs"
                >
                  {notes.map(n => (
                    <option key={n._id} value={n._id}>{n.title}</option>
                  ))}
                </select>
              )}
            </div>
          )}

          <DestinationRadio
            icon={<Plus className="h-3.5 w-3.5" />}
            label="Create as new note"
            value="new-note"
            selected={destination}
            onSelect={setDestination}
          />
          {destination === 'new-note' && (
            <div className="ml-6 mt-2">
              <input
                type="text"
                value={newNoteTitle}
                onChange={e => setNewNoteTitle(e.target.value)}
                placeholder="Note title"
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs"
              />
            </div>
          )}
        </fieldset>

        {/* Edit before commit */}
        <div className="space-y-2 border-t border-border pt-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-foreground-muted">Edit before commit</p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-6 text-xs"
                onClick={() => setManualEditOpen(v => !v)}
              >
                {manualEditOpen ? 'Hide editor' : 'Manual edit'}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-6 text-xs gap-1"
                onClick={handleAIRefine}
                disabled={refining || !studySetId}
              >
                {refining
                  ? <Loader2 className="h-3 w-3 animate-spin" />
                  : <Sparkles className="h-3 w-3" />}
                AI Refine
              </Button>
            </div>
          </div>
          {manualEditOpen && (
            <textarea
              value={editedText}
              onChange={e => setEditedText(e.target.value)}
              rows={6}
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs font-mono"
              placeholder="Separate items with --- on its own line."
            />
          )}
          {refinedText !== null && (
            <div className="rounded-md border border-primary/30 bg-primary/5 p-2 space-y-1">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-medium text-primary uppercase tracking-wide">AI Refined</p>
                <label className="text-[11px] text-foreground-muted flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={useRefined}
                    onChange={e => setUseRefined(e.target.checked)}
                  />
                  Use refined
                </label>
              </div>
              <pre className="text-xs whitespace-pre-wrap text-foreground">{refinedText}</pre>
            </div>
          )}
        </div>

        <DialogFooter className="pt-3">
          <Button type="button" variant="ghost" onClick={onClose} disabled={committing}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleCommit}
            disabled={committing || items.length === 0 || !studySetId}
            className="gap-1.5"
          >
            {committing && <Loader2 className="h-3 w-3 animate-spin" />}
            Commit
            <span className="font-mono text-[10px] opacity-70">⌘⏎</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DestinationRadio({
  icon, label, value, selected, onSelect, disabledReason,
}: {
  icon:           React.ReactNode;
  label:          string;
  value:          Destination;
  selected:       Destination;
  onSelect:       (v: Destination) => void;
  disabledReason?: string;
}) {
  return (
    <label
      className={cn(
        'flex items-center gap-2 rounded-md border px-3 py-2 text-xs cursor-pointer transition-colors',
        selected === value
          ? 'border-primary/40 bg-primary/5'
          : 'border-border hover:bg-surface-2',
      )}
    >
      <input
        type="radio"
        name="commit-destination"
        value={value}
        checked={selected === value}
        onChange={() => onSelect(value)}
        className="h-3 w-3"
      />
      <span className="text-foreground-muted">{icon}</span>
      <span className="flex-1 text-foreground">{label}</span>
      {disabledReason && (
        <span className="text-[10px] text-foreground-subtle italic">{disabledReason}</span>
      )}
    </label>
  );
}
