'use client';

import { useState, useCallback, useRef, DragEvent, ChangeEvent } from 'react';
import { Upload, FileSpreadsheet, X, CheckCircle2, Loader2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { gatewayPost } from '@/lib/api/gateway';
import { cn } from '@/lib/cn';

function parseCsv(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
  for (const line of lines) {
    const cells: string[] = [];
    let cell = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { cell += '"'; i++; }
        else { inQuotes = !inQuotes; }
      } else if (ch === delimiter && !inQuotes) {
        cells.push(cell.trim());
        cell = '';
      } else {
        cell += ch;
      }
    }
    cells.push(cell.trim());
    if (cells.some(c => c !== '')) rows.push(cells);
  }
  return rows;
}

const CLOZE_RE = /\{\{c\d+::/;

type CardType = 'basic' | 'bidirectional' | 'cloze';

interface ParsedRow {
  rowIndex:  number;
  front:     string;
  back:      string;
  tags:      string;
  cardType:  CardType;
  clozeBody: string;
  error?:    string;
}

function inferCardType(front: string, typeStr: string): CardType {
  const t = typeStr.toLowerCase();
  if (t === 'cloze' || t === 'bidirectional') return t as CardType;
  if (!t && CLOZE_RE.test(front)) return 'cloze';
  return 'basic';
}

function validateRow(row: ParsedRow): string | undefined {
  if (row.cardType === 'cloze') {
    const body = row.clozeBody || row.front;
    if (!body.trim()) return 'Missing cloze body';
    if (!CLOZE_RE.test(body)) return 'Cloze body has no {{cN::…}} markers';
    return undefined;
  }
  if (!row.front.trim()) return 'Missing front';
  if (!row.back.trim())  return 'Missing back';
  return undefined;
}

interface CsvImportDialogProps {
  open:       boolean;
  onClose:    () => void;
  studySetId: string;
  onImported: (count: number) => void;
}

type ImportState = 'idle' | 'importing' | 'done' | 'error';

export function CsvImportDialog({ open, onClose, studySetId, onImported }: CsvImportDialogProps) {
  const [rawText, setRawText]         = useState('');
  const [parsedRows, setParsedRows]   = useState<ParsedRow[]>([]);
  const [fileName, setFileName]       = useState('');
  const [delimiter, setDelimiter]     = useState(',');
  const [state, setState]             = useState<ImportState>('idle');
  const [result, setResult]           = useState<{ imported: number; duplicates: number; errors: string[] } | null>(null);
  const [dragOver, setDragOver]       = useState(false);
  const [parseError, setParseError]   = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const processText = useCallback((text: string, delim: string) => {
    setParseError('');
    const raw = parseCsv(text, delim);
    if (raw.length === 0) {
      setParseError('No data found in this file.');
      setParsedRows([]);
      return;
    }

    const header = raw[0].map(h => h.toLowerCase());
    const hasExtendedHeader = header.includes('front');
    const isAnkiHeader = header[0] === 'front' && header[1] === 'back';

    const colIdx = (name: string) => header.indexOf(name);
    const frontIdx = hasExtendedHeader ? colIdx('front') : 0;
    const backIdx  = hasExtendedHeader ? colIdx('back')  : 1;
    const tagsIdx  = colIdx('tags');
    const typeIdx  = colIdx('type');
    const clozeIdx = colIdx('cloze');
    const dataRows = (hasExtendedHeader || isAnkiHeader) ? raw.slice(1) : raw;

    const rows: ParsedRow[] = dataRows.map((cells, i) => {
      const front     = (cells[frontIdx] ?? '').trim();
      const back      = (cells[backIdx]  ?? '').trim();
      const tags      = tagsIdx  >= 0 ? (cells[tagsIdx]  ?? '').trim() : '';
      const typeStr   = typeIdx  >= 0 ? (cells[typeIdx]  ?? '').trim() : '';
      const clozeRaw  = clozeIdx >= 0 ? (cells[clozeIdx] ?? '').trim() : '';
      const cardType  = inferCardType(front, typeStr);
      const clozeBody = cardType === 'cloze' ? (clozeRaw || front) : '';
      const row: ParsedRow = { rowIndex: i + 2, front, back, tags, cardType, clozeBody };
      row.error = validateRow(row);
      return row;
    });

    setParsedRows(rows);
  }, []);

  const processFile = useCallback((text: string, name: string, delim: string) => {
    setFileName(name);
    setRawText(text);
    processText(text, delim);
  }, [processText]);

  const handleFile = useCallback((file: File) => {
    if (!file.name.endsWith('.csv') && file.type !== 'text/csv' && file.type !== 'text/plain') {
      setParseError('Please upload a .csv file.');
      return;
    }
    const reader = new FileReader();
    reader.onload = e => processFile(e.target?.result as string, file.name, delimiter);
    reader.onerror = () => setParseError('Failed to read file.');
    reader.readAsText(file);
  }, [processFile, delimiter]);

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleDelimiterChange = (d: string) => {
    setDelimiter(d);
    if (rawText) processText(rawText, d);
  };

  const validRows  = parsedRows.filter(r => !r.error);
  const errorRows  = parsedRows.filter(r => !!r.error);

  async function handleImport() {
    if (validRows.length === 0) return;
    setState('importing');

    const rows = validRows.map(r => ({
      front:     r.front,
      back:      r.back,
      tags:      r.tags,
      cardType:  r.cardType,
      clozeBody: r.cardType === 'cloze' ? r.clozeBody : undefined,
    }));

    try {
      const csvText = [
        'front,back,tags,type,cloze',
        ...rows.map(r =>
          [r.front, r.back, r.tags, r.cardType, r.cardType === 'cloze' ? r.clozeBody : '']
            .map(v => `"${(v ?? '').replace(/"/g, '""')}"`)
            .join(',')
        ),
      ].join('\n');
      const data = await gatewayPost<{ imported?: number; duplicates?: number; errors?: string[] }>(
        '/flashcards/bulk-import',
        { studySetId, csvText },
      );
      setResult({ imported: data.imported ?? 0, duplicates: data.duplicates ?? 0, errors: data.errors ?? [] });
      setState('done');
      onImported(data.imported ?? 0);
    } catch {
      setResult({ imported: 0, duplicates: 0, errors: ['Network error — please try again.'] });
      setState('error');
    }
  }

  function handleClose() {
    if (state === 'importing') return;
    setRawText('');
    setParsedRows([]);
    setFileName('');
    setState('idle');
    setResult(null);
    setParseError('');
    setDelimiter(',');
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={o => !o && handleClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-6 py-5 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
              <FileSpreadsheet className="h-4 w-4 text-primary" aria-hidden="true" />
            </div>
            <div>
              <DialogTitle>Import Flashcards from CSV</DialogTitle>
              <DialogDescription className="mt-0.5">
                Supports basic, cloze (&#123;&#123;c1::…&#125;&#125;), and bidirectional cards.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {(state === 'done' || state === 'error') && result && (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <div className={cn(
                'flex h-14 w-14 items-center justify-center rounded-full mb-4',
                state === 'done' ? 'bg-success-soft' : 'bg-danger-soft'
              )}>
                {state === 'done'
                  ? <CheckCircle2 className="h-7 w-7 text-success" aria-hidden="true" />
                  : <AlertTriangle className="h-7 w-7 text-danger" aria-hidden="true" />
                }
              </div>
              <h3 className="text-base font-medium text-foreground mb-1">
                {result.imported} card{result.imported !== 1 ? 's' : ''} imported
              </h3>
              {result.duplicates > 0 && (
                <p className="text-sm text-foreground-muted">{result.duplicates} duplicate{result.duplicates !== 1 ? 's' : ''} skipped</p>
              )}
              {result.errors.length > 0 && (
                <p className="text-sm text-danger mt-1">{result.errors.length} error{result.errors.length !== 1 ? 's' : ''}</p>
              )}
            </div>
          )}

          {state !== 'done' && state !== 'error' && (
            <>
              {/* Drop zone */}
              {!fileName && (
                <div
                  onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                  onClick={() => inputRef.current?.click()}
                  className={cn(
                    'relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed py-12 cursor-pointer transition-colors',
                    dragOver
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/50 hover:bg-surface-2'
                  )}
                  role="button"
                  tabIndex={0}
                  aria-label="Click or drag to upload CSV"
                  onKeyDown={e => e.key === 'Enter' && inputRef.current?.click()}
                >
                  <input
                    ref={inputRef}
                    type="file"
                    accept=".csv,text/csv,text/plain"
                    className="sr-only"
                    onChange={handleInputChange}
                  />
                  <Upload className="h-8 w-8 text-foreground-subtle mb-3" aria-hidden="true" />
                  <p className="text-sm font-medium text-foreground mb-1">Drop a CSV file here</p>
                  <p className="text-xs text-foreground-subtle">or click to browse</p>
                </div>
              )}

              {/* File loaded indicator */}
              {fileName && (
                <div className="flex items-center gap-3 rounded-lg border border-border bg-surface-2 px-4 py-3">
                  <FileSpreadsheet className="h-4 w-4 text-foreground-muted shrink-0" aria-hidden="true" />
                  <span className="text-sm text-foreground flex-1 truncate">{fileName}</span>
                  <button
                    onClick={() => { setFileName(''); setRawText(''); setParsedRows([]); setState('idle'); setParseError(''); }}
                    className="text-foreground-subtle hover:text-foreground transition-colors"
                    aria-label="Remove file"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}

              {parseError && (
                <div className="flex items-center gap-2 rounded-lg border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger">
                  <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {parseError}
                </div>
              )}

              {/* Delimiter */}
              {parsedRows.length > 0 && (
                <div>
                  <label className="text-xs font-medium text-foreground-muted mb-1.5 block">Delimiter</label>
                  <div className="flex gap-1.5" role="group" aria-label="CSV delimiter">
                    {[{ label: 'Comma', value: ',' }, { label: 'Semicolon', value: ';' }, { label: 'Tab', value: '\t' }].map(d => (
                      <button
                        key={d.value}
                        onClick={() => handleDelimiterChange(d.value)}
                        className={cn(
                          'flex-1 rounded-md border px-2 py-1.5 text-xs font-medium transition-colors cursor-pointer',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
                          delimiter === d.value
                            ? 'border-primary bg-primary/8 text-primary'
                            : 'border-border bg-surface-2 text-foreground-muted hover:text-foreground'
                        )}
                      >
                        {d.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Preview table */}
              {parsedRows.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-medium text-foreground-muted">
                      Preview · {validRows.length} card{validRows.length !== 1 ? 's' : ''} ready
                    </p>
                    {errorRows.length > 0 && (
                      <p className="text-xs text-danger">
                        {errorRows.length} row{errorRows.length !== 1 ? 's' : ''} will be skipped
                      </p>
                    )}
                  </div>
                  <div className="rounded-lg border border-border overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-surface-2 border-b border-border">
                          <th className="px-3 py-2 text-left text-xs font-medium text-foreground-muted w-8">#</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-foreground-muted">Front / Cloze</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-foreground-muted">Back</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-foreground-muted w-20">Type</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-foreground-muted w-28">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {parsedRows.slice(0, 8).map(row => (
                          <tr
                            key={row.rowIndex}
                            className={cn('border-b border-border last:border-0', row.error && 'bg-danger-soft/40')}
                          >
                            <td className="px-3 py-2 text-xs text-foreground-subtle font-mono">{row.rowIndex}</td>
                            <td className="px-3 py-2 text-foreground truncate max-w-[160px] text-xs">
                              {row.cardType === 'cloze' ? (row.clozeBody || row.front) : row.front || '—'}
                            </td>
                            <td className="px-3 py-2 text-foreground-muted truncate max-w-[160px] text-xs">
                              {row.cardType === 'cloze' ? '—' : (row.back || '—')}
                            </td>
                            <td className="px-3 py-2">
                              <span className={cn(
                                'rounded-full px-1.5 py-0.5 text-[10px] font-medium',
                                row.cardType === 'cloze'         && 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
                                row.cardType === 'bidirectional' && 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300',
                                row.cardType === 'basic'         && 'bg-surface-3 text-foreground-muted',
                              )}>
                                {row.cardType}
                              </span>
                            </td>
                            <td className="px-3 py-2">
                              {row.error ? (
                                <span className="text-[10px] text-danger flex items-center gap-1">
                                  <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden="true" />
                                  {row.error}
                                </span>
                              ) : (
                                <CheckCircle2 className="h-3.5 w-3.5 text-success" aria-hidden="true" />
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {parsedRows.length > 8 && (
                      <p className="px-4 py-2 text-xs text-foreground-subtle bg-surface-2">
                        +{parsedRows.length - 8} more row{parsedRows.length - 8 !== 1 ? 's' : ''}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Import progress */}
              {state === 'importing' && (
                <div className="flex items-center gap-3 text-sm text-foreground-muted">
                  <Loader2 className="h-4 w-4 animate-spin shrink-0" aria-hidden="true" />
                  Importing {validRows.length} card{validRows.length !== 1 ? 's' : ''}…
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter className="px-6 py-4 border-t border-border shrink-0">
          {state === 'done' || state === 'error' ? (
            <Button onClick={handleClose}>Done</Button>
          ) : (
            <>
              <Button variant="outline" onClick={handleClose} disabled={state === 'importing'}>
                Cancel
              </Button>
              <Button
                onClick={handleImport}
                disabled={validRows.length === 0 || state === 'importing'}
                className="gap-2"
              >
                {state === 'importing' ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    Importing…
                  </>
                ) : (
                  <>Import {validRows.length > 0 ? `${validRows.length} ` : ''}card{validRows.length !== 1 ? 's' : ''}</>
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
