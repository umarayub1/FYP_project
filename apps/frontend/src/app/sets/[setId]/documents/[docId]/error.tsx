'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { FileText } from 'lucide-react';
import { EmptyState } from '@/components/patterns/EmptyState';
import { Button } from '@/components/ui/button';

export default function DocumentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const params = useParams<{ setId: string }>();

  useEffect(() => {
    console.error('Document route error:', error);
  }, [error]);

  return (
    <div className="px-content-x py-12 max-w-2xl mx-auto">
      <EmptyState
        icon={<FileText className="h-6 w-6" aria-hidden="true" />}
        headline="This document couldn't load."
        subline="The reader hit an error. Your annotations and progress are saved."
        action={<Button onClick={reset}>Try again</Button>}
        secondaryAction={
          params?.setId ? (
            <Button asChild variant="ghost" size="sm">
              <Link href={`/sets/${params.setId}`}>Back to documents</Link>
            </Button>
          ) : null
        }
      />
    </div>
  );
}
