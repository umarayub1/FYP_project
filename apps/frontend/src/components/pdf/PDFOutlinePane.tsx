'use client';

import { cn } from '@/lib/cn';

export interface PDFOutlineItem {
  title: string;
  dest?: string | unknown[];
  items?: PDFOutlineItem[];
  pageNumber?: number;
}

interface PDFOutlinePaneProps {
  outline: PDFOutlineItem[];
  currentPage: number;
  numPages: number;
  onJumpToPage: (page: number) => void;
}

function OutlineItem({
  item,
  currentPage,
  onJumpToPage,
  depth,
}: {
  item: PDFOutlineItem;
  currentPage: number;
  onJumpToPage: (page: number) => void;
  depth: number;
}) {
  const isActive = item.pageNumber === currentPage;

  return (
    <li>
      <button
        onClick={() => item.pageNumber && onJumpToPage(item.pageNumber)}
        disabled={!item.pageNumber}
        className={cn(
          'w-full text-left rounded px-2 py-1 text-xs transition-colors cursor-pointer',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
          isActive ? 'bg-primary/10 text-primary font-medium' : 'text-foreground-muted hover:bg-surface-2 hover:text-foreground',
          !item.pageNumber && 'cursor-default opacity-50'
        )}
        style={{ paddingLeft: `${8 + depth * 12}px` }}
        aria-current={isActive ? 'page' : undefined}
      >
        {item.title}
      </button>
      {item.items && item.items.length > 0 && (
        <ul>
          {item.items.map((child, i) => (
            <OutlineItem key={i} item={child} currentPage={currentPage} onJumpToPage={onJumpToPage} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

export function PDFOutlinePane({ outline, currentPage, numPages, onJumpToPage }: PDFOutlinePaneProps) {
  const progressPct = numPages > 0 ? Math.min(1, (currentPage - 1) / Math.max(1, numPages - 1)) : 0;

  if (outline.length === 0) {
    return (
      <div className="relative h-full flex items-center justify-center p-4">
        {/* Reading progress line */}
        <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-border">
          <div
            className="absolute top-0 left-0 right-0 bg-primary/30 transition-all duration-300"
            style={{ height: `${progressPct * 100}%` }}
            aria-hidden="true"
          />
        </div>
        <p className="text-xs text-foreground-subtle text-center pl-2">No outline available for this document.</p>
      </div>
    );
  }

  return (
    <div className="relative h-full overflow-hidden">
      {/* Reading progress line */}
      <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-border z-10 pointer-events-none">
        <div
          className="absolute top-0 left-0 right-0 bg-primary/30 transition-all duration-300"
          style={{ height: `${progressPct * 100}%` }}
          aria-hidden="true"
        />
      </div>
      <nav aria-label="Document outline" className="h-full overflow-y-auto p-2 pl-3">
        <ul>
          {outline.map((item, i) => (
            <OutlineItem key={i} item={item} currentPage={currentPage} onJumpToPage={onJumpToPage} depth={0} />
          ))}
        </ul>
      </nav>
    </div>
  );
}
