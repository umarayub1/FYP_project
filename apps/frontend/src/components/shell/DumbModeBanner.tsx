'use client';

import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useAIStatus, type AIUnavailableReason } from '@/contexts/AIStatusContext';
import { cn } from '@/lib/cn';

const REASON_MESSAGES: Record<NonNullable<AIUnavailableReason>, string> = {
  quota_exhausted: "You've hit your AI quota for this month.",
  invalid_key: 'Your API key is invalid or expired.',
  ollama_offline: "Ollama isn't reachable at the configured URL.",
  network_error: "Couldn't reach the AI provider.",
};

export function DumbModeBanner() {
  const { status, reason } = useAIStatus();

  if (status !== 'unavailable') return null;

  const reasonText = reason ? REASON_MESSAGES[reason] : 'AI service is currently unavailable.';

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'flex items-center gap-3 px-4 py-2 text-sm font-medium shrink-0',
        'bg-[hsl(var(--warning-soft))] text-[hsl(var(--warning))]',
        'border-l-2 border-[hsl(var(--warning))] border-b border-b-[hsl(var(--warning)/0.2)]',
      )}
    >
      <AlertTriangle className="h-[14px] w-[14px] shrink-0" aria-hidden="true" />
      <span className="flex-1">
        AI features are paused. Your notes, PDFs, and flashcards still work.
      </span>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              className="text-xs underline underline-offset-2 hover:no-underline cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring rounded"
              aria-label="Why is AI unavailable?"
            >
              Why?
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-[220px] text-xs">
            {reasonText}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <Link
        href="/settings/api-keys"
        className="text-xs font-medium underline underline-offset-2 hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring rounded whitespace-nowrap"
      >
        Fix it →
      </Link>
    </div>
  );
}
