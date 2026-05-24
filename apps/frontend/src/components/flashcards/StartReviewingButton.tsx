'use client';

import { useState } from 'react';
import { Play } from 'lucide-react';
import { ReviewStartDialog, type ReviewableSet } from './ReviewStartDialog';

interface StartReviewingButtonProps {
  sets:     ReviewableSet[];
  totalDue: number;
}

export function StartReviewingButton({ sets, totalDue }: StartReviewingButtonProps) {
  const [open, setOpen] = useState(false);
  if (totalDue === 0) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-fg hover:bg-primary-hover transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
      >
        <Play className="h-3.5 w-3.5" aria-hidden="true" />
        Start reviewing
      </button>
      <ReviewStartDialog
        open={open}
        onClose={() => setOpen(false)}
        sets={sets}
        totalDue={totalDue}
      />
    </>
  );
}
