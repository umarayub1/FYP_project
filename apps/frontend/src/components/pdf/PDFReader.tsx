'use client';

import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';

const PDFReaderImpl = dynamic(
  () => import('./PDFReaderImpl').then(m => ({ default: m.PDFReader })),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full flex-col gap-3 p-6">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-[calc(100%-3rem)] w-full" />
      </div>
    ),
  },
);

export const PDFReader = PDFReaderImpl;

export type { Checkpoint } from './PDFReaderImpl';
