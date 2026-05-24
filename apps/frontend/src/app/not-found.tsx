import Link from 'next/link';
import { FileQuestion } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="max-w-md w-full text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-surface-2">
          <FileQuestion className="h-8 w-8 text-foreground-muted" aria-hidden="true" />
        </div>
        <h1 className="text-display text-foreground mb-2" style={{ letterSpacing: '-0.01em' }}>
          Page not found
        </h1>
        <p className="text-sm text-foreground-muted mb-8">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <Button asChild>
          <Link href="/now-brief">Go to Now Brief</Link>
        </Button>
      </div>
    </div>
  );
}
