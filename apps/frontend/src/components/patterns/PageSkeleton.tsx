import { Skeleton } from '@/components/ui/skeleton';

interface PageSkeletonProps {
  title: string;
  rows?: number;
}

export function PageSkeleton({ title, rows = 4 }: PageSkeletonProps) {
  return (
    <div className="px-content-x py-8 max-w-4xl mx-auto">
      <Skeleton className="h-8 w-48 mb-section-y" />
      <div className="flex flex-col gap-card-y">
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}
