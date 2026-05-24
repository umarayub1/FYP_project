import { getStudySets } from '@/lib/api/study-sets';
import { SearchPageClient } from './SearchPageClient';

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string; setId?: string }>;
}) {
  const { q = '', type, setId } = await searchParams;
  const sets = await getStudySets({ includeArchived: true }).catch(() => []);

  return (
    <SearchPageClient initialQuery={q} initialType={type} initialSetId={setId} studySets={sets} />
  );
}
