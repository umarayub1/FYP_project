'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Upload } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { gatewayPost } from '@/lib/api/gateway';
import { cn } from '@/lib/cn';

interface ParsedCard {
  front: string;
  back:  string;
  error?: string;
}

interface BatchImportDialogProps {
  setId:         string;
  open:          boolean;
  onOpenChange:  (open: boolean) => void;
  onImported:    () => void;
}

// Split on first comma only so back fields may contain commas
function parseCSV(text: string): ParsedCard[] {
  return text
    .trim()
    .split('\n')
    .filter(line => line.trim() !== '')
    .map((line, i) => {
      const commaIdx = line.indexOf(',');
      if (commaIdx === -1)
        return { front: '', back: '', error: `Row ${i + 1}: expected "front,back"` };
      return {
        front: line.slice(0, commaIdx).trim(),
        back:  line.slice(commaIdx + 1).trim(),
      };
    });
}

function parseJSON(text: string): ParsedCard[] {
  try {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed))
      return [{ front: '', back: '', error: 'JSON must be an array' }];
    return parsed.map((item: unknown, i) => {
      if (typeof item !== 'object' || item === null)
        return { front: '', back: '', error: `Item ${i + 1}: must be an object` };
      const obj = item as Record<string, unknown>;
      if (!obj.front || !obj.back)
        return {
          front: String(obj.front ?? ''),
          back:  String(obj.back  ?? ''),
          error: `Item ${i + 1}: missing front or back`,
        };
      return { front: String(obj.front), back: String(obj.back) };
    });
  } catch {
    return [{ front: '', back: '', error: 'Invalid JSON' }];
  }
}

function PreviewTable({ cards }: { cards: ParsedCard[] }) {
  const preview  = cards.slice(0, 10);
  const overflow = cards.length - preview.length;

  return (
    <div className="border border-border rounded-md overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-surface-2 border-b border-border">
          <tr>
            <th className="px-3 py-2 text-left text-xs font-medium text-foreground-muted w-8">#</th>
            <th className="px-3 py-2 text-left text-xs font-medium text-foreground-muted w-1/2">Front</th>
            <th className="px-3 py-2 text-left text-xs font-medium text-foreground-muted w-1/2">Back</th>
          </tr>
        </thead>
        <tbody>
          {preview.map((card, i) => (
            <tr
              key={i}
              className={cn('border-t border-border', card.error && 'bg-danger-soft')}
            >
              <td className="px-3 py-2 font-mono text-xs text-foreground-muted">{i + 1}</td>
              <td className="px-3 py-2 truncate max-w-[220px]">
                {card.error
                  ? <span className="text-danger text-xs">{card.error}</span>
                  : card.front}
              </td>
              <td className="px-3 py-2 text-foreground-muted truncate max-w-[220px]">{card.back}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {overflow > 0 && (
        <p className="px-3 py-2 text-xs text-foreground-muted border-t border-border bg-surface-2">
          and <span className="font-mono">{overflow}</span> more card{overflow !== 1 ? 's' : ''}
        </p>
      )}
    </div>
  );
}

export function BatchImportDialog({
  setId, open, onOpenChange, onImported,
}: BatchImportDialogProps) {
  const [tab, setTab]                   = useState<'csv' | 'json'>('csv');
  const [inputText, setInputText]       = useState('');
  const [parsed, setParsed]             = useState<ParsedCard[]>([]);
  const [isImporting, setIsImporting]   = useState(false);
  const [importErrors, setImportErrors] = useState<string[]>([]);

  const validCards  = parsed.filter(c => !c.error);
  const parseErrors = parsed.filter(c => c.error);

  function handleTabChange(v: string) {
    setTab(v as 'csv' | 'json');
    setInputText('');
    setParsed([]);
    setImportErrors([]);
  }

  function handleParse() {
    const cards = tab === 'csv' ? parseCSV(inputText) : parseJSON(inputText);
    if (cards.length > 200) {
      toast.error('Maximum 200 cards per import');
      setParsed(cards.slice(0, 200));
      return;
    }
    setParsed(cards);
    setImportErrors([]);
  }

  async function handleImport() {
    if (validCards.length === 0) return;
    setIsImporting(true);
    setImportErrors([]);
    try {
      const result = await gatewayPost<{ created: number; errors: string[] }>(
        `/study-sets/${setId}/flashcards/batch`,
        { cards: validCards },
      );
      setImportErrors(result.errors ?? []);
      if (result.created > 0) {
        toast.success(`Imported ${result.created} card${result.created !== 1 ? 's' : ''}`);
        onImported();
        if (!result.errors?.length) handleClose();
      } else {
        toast.error('No cards were imported');
      }
    } catch {
      toast.error('Import failed');
    } finally {
      setIsImporting(false);
    }
  }

  function handleClose() {
    if (isImporting) return;
    setInputText('');
    setParsed([]);
    setImportErrors([]);
    setTab('csv');
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && handleClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-6 py-5 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
              <Upload className="h-4 w-4 text-primary" aria-hidden="true" />
            </div>
            <div>
              <DialogTitle>Import flashcards</DialogTitle>
              <DialogDescription className="mt-0.5">
                Paste CSV or JSON below. Up to 200 cards per import.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          <Tabs value={tab} onValueChange={handleTabChange}>
            <TabsList>
              <TabsTrigger value="csv">CSV</TabsTrigger>
              <TabsTrigger value="json">JSON</TabsTrigger>
            </TabsList>

            <TabsContent value="csv" className="mt-3 space-y-2">
              <p className="text-xs text-foreground-muted">
                One card per line:{' '}
                <code className="font-mono bg-surface-2 px-1 rounded">front,back</code>
              </p>
              <Textarea
                value={inputText}
                onChange={e => { setInputText(e.target.value); setParsed([]); }}
                placeholder={'What is photosynthesis?,The process by which plants convert sunlight to energy\nWhat is osmosis?,Movement of water through a semipermeable membrane'}
                rows={6}
                className="font-mono text-xs"
              />
            </TabsContent>

            <TabsContent value="json" className="mt-3 space-y-2">
              <p className="text-xs text-foreground-muted">
                Array of{' '}
                <code className="font-mono bg-surface-2 px-1 rounded">{'{"front":"...","back":"..."}'}</code>{' '}
                objects
              </p>
              <Textarea
                value={inputText}
                onChange={e => { setInputText(e.target.value); setParsed([]); }}
                placeholder={'[\n  {"front": "What is osmosis?", "back": "Movement of water through a semipermeable membrane"}\n]'}
                rows={6}
                className="font-mono text-xs"
              />
            </TabsContent>
          </Tabs>

          <Button
            variant="outline"
            size="sm"
            onClick={handleParse}
            disabled={!inputText.trim()}
          >
            Preview cards
          </Button>

          {parsed.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-foreground-muted">
                <span className="font-medium text-foreground">{validCards.length}</span> valid
                {parseErrors.length > 0 && (
                  <> · <span className="text-danger">{parseErrors.length} error{parseErrors.length !== 1 ? 's' : ''}</span></>
                )}
              </p>
              <PreviewTable cards={parsed} />
            </div>
          )}

          {importErrors.length > 0 && (
            <div className="rounded-lg border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger space-y-1">
              {importErrors.map((e, i) => <p key={i}>{e}</p>)}
            </div>
          )}
        </div>

        <DialogFooter className="px-6 py-4 border-t border-border shrink-0">
          <Button variant="outline" onClick={handleClose} disabled={isImporting}>
            Cancel
          </Button>
          {validCards.length > 0 && (
            <Button onClick={handleImport} disabled={isImporting}>
              {isImporting
                ? 'Importing…'
                : `Import ${validCards.length} card${validCards.length !== 1 ? 's' : ''}`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
