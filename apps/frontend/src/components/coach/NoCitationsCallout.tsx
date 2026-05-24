'use client';

import { AlertTriangle } from 'lucide-react';

/**
 * Surface the cold-path leak: when the Coach RAG retrieval returned zero
 * chunks, the LLM was answered with no source context. Backend prepends a
 * disclaimer to its prose, but a visual callout makes it impossible to miss.
 *
 * Plan F.1 acceptance: rendered in `--warning-soft`, above the message body.
 */
export function NoCitationsCallout() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-start gap-2 rounded-md bg-[hsl(var(--warning-soft))] px-3 py-2 text-xs text-[hsl(var(--warning))]"
    >
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className="leading-snug">
        No sources matched — answering from general knowledge.
      </span>
    </div>
  );
}
