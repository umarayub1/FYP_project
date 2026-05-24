'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { useRouter } from 'next/navigation';

export interface WeakSpot {
  id:    string;
  front: string;
}

interface WeakSpotsStripProps {
  weakSpots: WeakSpot[];
  setId:     string;
}

const MAX_VISIBLE = 6;

export function WeakSpotsStrip({ weakSpots, setId }: WeakSpotsStripProps) {
  const router = useRouter();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const active  = weakSpots.filter(w => !dismissed.has(w.id));
  const visible = active.slice(0, MAX_VISIBLE);
  const extra   = active.length - MAX_VISIBLE;

  if (visible.length === 0) return null;

  function dismiss(id: string) {
    setDismissed(prev => new Set([...prev, id]));
  }

  return (
    <div className="mb-6">
      <p className="section-label mb-2">Struggling With</p>
      <div className="flex flex-wrap gap-2" role="list" aria-label="Weak spot flashcards">
        {visible.map(spot => (
          <span
            key={spot.id}
            role="listitem"
            className="flex items-center gap-1 rounded-[4px] px-2 py-1"
            style={{
              background: 'hsl(var(--danger-soft))',
              border:     '0.5px solid hsl(var(--danger))',
            }}
          >
            <button
              onClick={() => router.push(`/sets/${setId}/flashcards?highlight=${spot.id}`)}
              className="font-mono text-[11px] text-danger cursor-pointer focus-visible:outline-none"
              aria-label={`Open flashcard: ${spot.front}`}
            >
              {spot.front.length > 32 ? spot.front.slice(0, 32) + '…' : spot.front}
            </button>
            <button
              onClick={() => dismiss(spot.id)}
              className="ml-0.5 rounded text-danger/60 hover:text-danger transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-danger cursor-pointer"
              aria-label={`Dismiss: ${spot.front}`}
            >
              <X className="h-2.5 w-2.5" aria-hidden="true" />
            </button>
          </span>
        ))}
        {extra > 0 && (
          <span
            className="flex items-center rounded-[4px] px-2 py-1 font-mono text-[11px] text-foreground-muted"
            style={{ background: 'hsl(var(--surface-2))' }}
          >
            +{extra} more
          </span>
        )}
      </div>
    </div>
  );
}
