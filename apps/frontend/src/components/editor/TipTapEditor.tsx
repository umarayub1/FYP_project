'use client';

import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';

const TipTapEditorImpl = dynamic(
  () => import('./TipTapEditorImpl').then(m => ({ default: m.TipTapEditor })),
  {
    ssr: false,
    loading: () => (
      <div className="space-y-2 p-4">
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    ),
  },
);

export const TipTapEditor = TipTapEditorImpl;
