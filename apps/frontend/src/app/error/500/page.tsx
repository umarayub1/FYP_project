import { AlertOctagon } from 'lucide-react';
import { ReloadButton } from './ReloadButton';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export const metadata = { title: '500 — Something went wrong — Synapse' };

export default function ServerErrorPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="max-w-md w-full text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-danger-soft">
          <AlertOctagon className="h-8 w-8 text-danger" aria-hidden="true" />
        </div>
        <h1 className="text-display text-foreground mb-2" style={{ letterSpacing: '-0.01em' }}>
          Something went wrong
        </h1>
        <p className="text-sm text-foreground-muted mb-8">
          We encountered an unexpected error. The team has been notified.
        </p>
        <div className="flex gap-3 justify-center">
          <ReloadButton />
          <Button asChild>
            <Link href="/now-brief">Go home</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
