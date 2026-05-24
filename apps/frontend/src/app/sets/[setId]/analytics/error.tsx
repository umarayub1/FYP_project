'use client';

import { useEffect } from 'react';
import { BarChart2 } from 'lucide-react';
import { EmptyState } from '@/components/patterns/EmptyState';
import { Button } from '@/components/ui/button';

export default function AnalyticsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Analytics route error:', error);
  }, [error]);

  return (
    <div className="px-content-x py-8 max-w-4xl mx-auto">
      <EmptyState
        icon={<BarChart2 className="h-6 w-6" aria-hidden="true" />}
        headline="Analytics couldn't load."
        subline="Something went wrong while rendering this view. Your data is safe."
        action={<Button onClick={reset}>Try again</Button>}
      />
    </div>
  );
}
