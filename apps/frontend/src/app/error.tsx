'use client';

import { useEffect } from 'react';
import { AlertOctagon } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="max-w-md w-full text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-danger-soft">
          <AlertOctagon className="h-8 w-8 text-danger" aria-hidden="true" />
        </div>
        <h1 className="text-display text-foreground mb-2">Something went wrong</h1>
        <p className="text-sm text-foreground-muted mb-8">
          We encountered an unexpected error. The team has been notified.
        </p>
        <Button onClick={reset}>Try again</Button>
      </div>
    </div>
  );
}
