'use client';

import { useRouter } from 'next/navigation';
import { SearchOverlay } from '@/components/search/SearchOverlay';
import type { StudySet } from '@/lib/api/study-sets';

interface SearchPageClientProps {
  initialQuery:  string;
  initialType?:  string;
  initialSetId?: string;
  studySets:     StudySet[];
}

export function SearchPageClient({ initialQuery, initialType, initialSetId, studySets }: SearchPageClientProps) {
  const router = useRouter();

  return (
    <SearchOverlay
      asPage
      onClose={() => router.back()}
      initialQuery={initialQuery}
      initialType={initialType}
      initialSetId={initialSetId}
      studySets={studySets}
    />
  );
}
