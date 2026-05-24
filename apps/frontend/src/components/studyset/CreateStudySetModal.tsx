'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Loader2 } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { createStudySet } from '@/lib/api/study-sets';
import { cn } from '@/lib/cn';

const COLOR_SWATCHES: { token: string; label: string }[] = [
  { token: '--set-violet', label: 'Violet' },
  { token: '--set-teal',   label: 'Teal'   },
  { token: '--set-amber',  label: 'Amber'  },
  { token: '--set-red',    label: 'Red'    },
  { token: '--set-blue',   label: 'Blue'   },
  { token: '--set-green',  label: 'Green'  },
  { token: '--set-pink',   label: 'Pink'   },
  { token: '--set-slate',  label: 'Slate'  },
];

interface CreateStudySetModalProps {
  open:    boolean;
  onClose: () => void;
}

export function CreateStudySetModal({ open, onClose }: CreateStudySetModalProps) {
  const router   = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [name,    setName]    = useState('');
  const [color,   setColor]   = useState(COLOR_SWATCHES[0].token);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  useEffect(() => {
    if (open) {
      setName('');
      setColor(COLOR_SWATCHES[0].token);
      setError('');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) { setError('Name is required.'); return; }

    setLoading(true);
    setError('');
    try {
      const set = await createStudySet({ name: trimmed, color });
      router.push(`/sets/${set._id}`);
      router.refresh();
      onClose();
    } catch {
      setError('Could not create study set. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>New study set</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-5">
          {/* Name input */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="set-name" className="text-xs font-medium text-foreground-muted">
              Name
            </label>
            <input
              ref={inputRef}
              id="set-name"
              type="text"
              value={name}
              onChange={e => { setName(e.target.value); setError(''); }}
              placeholder="e.g. Organic Chemistry"
              maxLength={100}
              className={cn(
                'h-9 w-full rounded-md border bg-surface-2 px-3 text-sm text-foreground placeholder:text-foreground-subtle',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
                error ? 'border-danger' : 'border-border'
              )}
            />
            {error && <p className="text-xs text-danger">{error}</p>}
          </div>

          {/* Color picker */}
          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium text-foreground-muted">Color</span>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Set color">
              {COLOR_SWATCHES.map(({ token, label }) => (
                <button
                  key={token}
                  type="button"
                  role="radio"
                  aria-checked={color === token}
                  aria-label={label}
                  onClick={() => setColor(token)}
                  className={cn(
                    'relative h-7 w-7 rounded-full transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring cursor-pointer',
                    color === token ? 'scale-110 ring-2 ring-offset-2 ring-offset-background' : 'hover:scale-105'
                  )}
                  style={{ backgroundColor: `hsl(var(${token}))` }}
                >
                  {color === token && (
                    <Check className="absolute inset-0 m-auto h-3.5 w-3.5 text-white drop-shadow" aria-hidden="true" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Preview */}
          <div
            className="flex items-center gap-3 rounded-lg border border-border bg-surface-2 px-4 py-3"
            aria-hidden="true"
          >
            <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: `hsl(var(${color}))` }} />
            <span className="text-sm font-medium text-foreground truncate">
              {name.trim() || 'Study set name'}
            </span>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !name.trim()}>
              {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
              Create set
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
