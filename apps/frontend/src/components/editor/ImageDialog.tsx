'use client';

import { useEffect, useRef, useState } from 'react';
import { ImagePlus } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface ImageDialogProps {
  open: boolean;
  onClose: () => void;
  onInsert: (url: string, alt: string) => void;
}

export function ImageDialog({ open, onClose, onInsert }: ImageDialogProps): JSX.Element {
  const [url, setUrl] = useState('');
  const [alt, setAlt] = useState('');
  const [error, setError] = useState<string | null>(null);
  const urlInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) {
      setUrl('');
      setAlt('');
      setError(null);
      return;
    }
    queueMicrotask(() => urlInputRef.current?.focus());
  }, [open]);

  const submit = () => {
    const trimmed = url.trim();
    if (!trimmed) {
      setError('Image URL is required.');
      return;
    }
    try {
      // Lightweight validation — reject obvious nonsense, allow data URIs +
      // http(s). `new URL` throws if the value isn't a parseable URL.
      // eslint-disable-next-line no-new
      new URL(trimmed);
    } catch {
      setError('That doesn’t look like a valid URL.');
      return;
    }
    onInsert(trimmed, alt.trim());
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <ImagePlus className="h-4 w-4 text-[hsl(var(--foreground-muted))]" aria-hidden="true" />
            Insert image
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <label className="block space-y-1">
            <span className="text-xs font-medium text-[hsl(var(--foreground-muted))]">
              Image URL
            </span>
            <input
              ref={urlInputRef}
              type="url"
              value={url}
              onChange={e => {
                setUrl(e.target.value);
                if (error) setError(null);
              }}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder="https://example.com/image.png"
              className="w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2.5 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--focus-ring))]"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-xs font-medium text-[hsl(var(--foreground-muted))]">
              Alt text <span className="text-[hsl(var(--foreground-subtle))]">(optional)</span>
            </span>
            <input
              type="text"
              value={alt}
              onChange={e => setAlt(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder="Short description for screen readers"
              className="w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2.5 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--focus-ring))]"
            />
          </label>

          {error && (
            <p className="text-xs text-[hsl(var(--danger))]" role="alert">{error}</p>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit}>Insert</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
