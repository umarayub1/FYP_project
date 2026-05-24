'use client';

import { useState, useId, useMemo } from 'react';
import { type Tag } from '@/lib/api/tags';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { TagInput } from '@/components/tags/TagInput';
import { ClozeEditor } from './ClozeEditor';
import {
  type Flashcard, type FlashcardCreatePayload, type FlashcardUpdatePayload,
  createFlashcard, updateFlashcard, deleteFlashcard,
} from '@/lib/api/flashcards';
import { cn } from '@/lib/cn';

type CardType = 'basic' | 'bidirectional' | 'cloze';

interface FlashcardEditDialogProps {
  open: boolean;
  onClose: () => void;
  studySetId: string;
  card?: Flashcard;
  tagSuggestions?: string[];
  onSaved: (card: Flashcard) => void;
  onDeleted?: () => void;
}

function renderKatex(text: string): string {
  // Replace $$...$$ (display) then $...$ (inline)
  let out = text
    .replace(/\$\$([\s\S]+?)\$\$/g, (_, math) => {
      try { return katex.renderToString(math, { displayMode: true, throwOnError: false }); }
      catch { return `$$${math}$$`; }
    })
    .replace(/\$(.+?)\$/g, (_, math) => {
      try { return katex.renderToString(math, { displayMode: false, throwOnError: false }); }
      catch { return `$${math}$`; }
    });
  // Minimal markdown: **bold**, *italic*, `code`
  out = out
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code class="rounded bg-surface-3 px-0.5 text-xs font-mono">$1</code>');
  return out;
}

function FieldPreview({ text }: { text: string }) {
  if (!text) return null;
  return (
    <div
      className="mt-1 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground leading-relaxed"
      dangerouslySetInnerHTML={{ __html: renderKatex(text) }}
      aria-label="Preview"
    />
  );
}


export function FlashcardEditDialog({
  open,
  onClose,
  studySetId,
  card,
  tagSuggestions,
  onSaved,
  onDeleted,
}: FlashcardEditDialogProps) {
  const isEdit = !!card;

  const [cardType, setCardType]   = useState<CardType>(card?.cardType ?? 'basic');
  const [front, setFront]         = useState(card?.front ?? '');
  const [back, setBack]           = useState(card?.back ?? '');
  const [clozeBody, setClozeBody] = useState(card?.clozeBody ?? '');
  const [tags, setTags]           = useState<string[]>(card?.tags ?? []);
  const sourceTitle               = card?.sourceTitle;
  const sourcePage                = card?.sourcePage;
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState('');

  const tagSuggestionObjs = useMemo<Tag[]>(
    () => (tagSuggestions ?? []).map(t => ({ _id: t, name: t, slug: t, global: false, usageCount: 0 })),
    [tagSuggestions]
  );

  const frontId = useId();
  const backId  = useId();
  const errId   = useId();

  const canSave = cardType === 'cloze'
    ? clozeBody.trim().length > 0 && /\{\{c\d+::/.test(clozeBody)
    : front.trim().length > 0 && back.trim().length > 0;

  async function handleSave() {
    if (!canSave || saving) return;
    setSaving(true);
    setError('');
    try {
      const payload: FlashcardCreatePayload | FlashcardUpdatePayload = {
        cardType,
        front:        cardType !== 'cloze' ? front : undefined,
        back:         cardType !== 'cloze' ? back  : undefined,
        clozeBody:    cardType === 'cloze' ? clozeBody : undefined,
        bidirectional: cardType === 'bidirectional' ? true : undefined,
        tags,
        sourceTitle,
        sourcePage,
      };

      let saved: Flashcard;
      if (isEdit) {
        saved = await updateFlashcard(card!._id, card!.studySetId, payload as FlashcardUpdatePayload);
      } else {
        saved = await createFlashcard(studySetId, payload as FlashcardCreatePayload);
      }
      onSaved(saved);
      onClose();
    } catch {
      setError('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!card) return;
    await deleteFlashcard(card._id, card.studySetId).catch(() => {});
    onDeleted?.();
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-xl w-full max-h-[90vh] overflow-y-auto p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border">
          <DialogTitle>{isEdit ? 'Edit flashcard' : 'New flashcard'}</DialogTitle>
        </DialogHeader>

        <div className="px-6 py-4 space-y-4">
          {/* Type selector */}
          <div>
            <p className="text-xs font-medium text-foreground-subtle mb-2 uppercase tracking-wider">
              Card type
            </p>
            <div role="group" aria-label="Card type" className="flex gap-1 bg-surface-2 rounded-md p-0.5 w-fit">
              {(['basic', 'bidirectional', 'cloze'] as CardType[]).map(type => (
                <button
                  key={type}
                  type="button"
                  role="radio"
                  aria-checked={cardType === type}
                  onClick={() => setCardType(type)}
                  className={cn(
                    'rounded px-3 py-1 text-xs font-medium capitalize transition-colors cursor-pointer',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
                    cardType === type
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-foreground-muted hover:text-foreground'
                  )}
                >
                  {type === 'bidirectional' ? 'Bidirectional' : type.charAt(0).toUpperCase() + type.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Bidirectional hint */}
          {cardType === 'bidirectional' && (
            <p className="text-xs italic text-foreground-muted">
              A reverse card will be created on save.
            </p>
          )}

          {/* Basic / Bidirectional fields */}
          {cardType !== 'cloze' && (
            <>
              <div>
                <label htmlFor={frontId} className="block text-xs font-medium text-foreground-subtle mb-1 uppercase tracking-wider">
                  Front <span aria-hidden="true">*</span>
                </label>
                <textarea
                  id={frontId}
                  value={front}
                  onChange={e => setFront(e.target.value)}
                  rows={3}
                  className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-foreground resize-y outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                  placeholder="Front side of the card… (supports $math$ and **markdown**)"
                  aria-required="true"
                  aria-describedby={error ? errId : undefined}
                />
                <FieldPreview text={front} />
              </div>
              <div>
                <label htmlFor={backId} className="block text-xs font-medium text-foreground-subtle mb-1 uppercase tracking-wider">
                  Back <span aria-hidden="true">*</span>
                </label>
                <textarea
                  id={backId}
                  value={back}
                  onChange={e => setBack(e.target.value)}
                  rows={3}
                  className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-foreground resize-y outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                  placeholder="Back side of the card…"
                  aria-required="true"
                />
                <FieldPreview text={back} />
              </div>
            </>
          )}

          {/* Cloze editor */}
          {cardType === 'cloze' && (
            <div>
              <label htmlFor="cloze-body" className="block text-xs font-medium text-foreground-subtle mb-1 uppercase tracking-wider">
                Cloze body <span aria-hidden="true">*</span>
              </label>
              <ClozeEditor value={clozeBody} onChange={setClozeBody} />
            </div>
          )}

          {/* Source (read-only) */}
          {sourceTitle && (
            <div>
              <p className="text-xs font-medium text-foreground-subtle mb-1 uppercase tracking-wider">Source</p>
              <div className="inline-flex items-center rounded-full border border-border bg-surface-2 px-2.5 py-1 text-xs text-foreground-muted max-w-full">
                <span className="truncate">
                  {sourceTitle}{sourcePage ? ` · p. ${sourcePage}` : ''}
                </span>
              </div>
            </div>
          )}

          {/* Tags */}
          <div>
            <label className="block text-xs font-medium text-foreground-subtle mb-1 uppercase tracking-wider">
              Tags
            </label>
            <TagInput value={tags} onChange={setTags} suggestions={tagSuggestionObjs} />
          </div>

          {/* Error */}
          {error && (
            <p id={errId} role="alert" className="text-xs text-destructive">
              {error}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 px-6 py-4 border-t border-border">
          {isEdit && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive border-destructive/30 hover:bg-destructive/10 text-xs"
                >
                  Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this card?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This flashcard will be permanently deleted. This cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDelete}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          <div className="flex gap-2 ml-auto">
            <Button variant="outline" size="sm" onClick={onClose} className="text-xs">
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={!canSave || saving}
              className="text-xs"
            >
              {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create card'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
