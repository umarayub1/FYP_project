'use client';

import { ZoomIn, ZoomOut, Bookmark, Eye, EyeOff, MoreHorizontal, FileText, CheckSquare } from 'lucide-react';
import { cn } from '@/lib/cn';
import { formatDistanceToNow } from 'date-fns';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { Checkpoint } from './PDFReader';

interface PDFToolbarProps {
  currentPage: number;
  numPages: number;
  scale: number;
  onPageChange: (page: number) => void;
  onZoom: (delta: number) => void;
  onFitWidth: () => void;
  onFitPage: () => void;
  checkpoints?: Checkpoint[];
  readingTimeRemaining?: number;
  annotationCount?: number;
  eyeComfortMode?: boolean;
  onToggleEyeComfort?: () => void;
  comprehensionEnabled?: boolean;
  onToggleComprehension?: () => void;
  onExportToCornell?: () => void;
}

export function PDFToolbar({
  currentPage,
  numPages,
  scale,
  onPageChange,
  onZoom,
  onFitWidth,
  onFitPage,
  checkpoints,
  readingTimeRemaining,
  annotationCount = 0,
  eyeComfortMode = false,
  onToggleEyeComfort,
  comprehensionEnabled = false,
  onToggleComprehension,
  onExportToCornell,
}: PDFToolbarProps) {
  const recentCheckpoints = checkpoints ? [...checkpoints].reverse().slice(0, 10) : [];

  function handlePageInput(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      const val = parseInt((e.target as HTMLInputElement).value, 10);
      if (!isNaN(val) && val >= 1 && val <= numPages) onPageChange(val);
    }
  }

  return (
    <div className="flex items-center justify-between gap-2 border-t border-border bg-background px-4 py-1.5 text-sm flex-wrap">
      {/* Left: reading time + annotation count */}
      <div className="flex items-center gap-3 text-[11px] font-mono text-foreground-subtle">
        {numPages > 0 && readingTimeRemaining !== undefined && readingTimeRemaining > 0 && (
          <span aria-label={`About ${readingTimeRemaining} minutes remaining`}>
            ~{readingTimeRemaining} min remaining
          </span>
        )}
        {annotationCount > 0 && (
          <span aria-label={`${annotationCount} annotation${annotationCount !== 1 ? 's' : ''}`}>
            {annotationCount} annotation{annotationCount !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Center: zoom + page + fit */}
      <div className="flex items-center gap-3">
        {/* Zoom */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => onZoom(-0.25)}
            disabled={scale <= 0.5}
            className="rounded p-1 hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring cursor-pointer disabled:opacity-40"
            aria-label="Zoom out"
          >
            <ZoomOut className="h-3.5 w-3.5 text-foreground-muted" aria-hidden="true" />
          </button>
          <span className="min-w-10 text-center text-xs font-mono text-foreground-muted">
            {Math.round(scale * 100)}%
          </span>
          <button
            onClick={() => onZoom(0.25)}
            disabled={scale >= 3}
            className="rounded p-1 hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring cursor-pointer disabled:opacity-40"
            aria-label="Zoom in"
          >
            <ZoomIn className="h-3.5 w-3.5 text-foreground-muted" aria-hidden="true" />
          </button>
        </div>

        {/* Page navigation */}
        <div className="flex items-center gap-1 text-xs text-foreground-muted">
          <span>Page</span>
          <input
            type="number"
            defaultValue={currentPage}
            key={currentPage}
            min={1}
            max={numPages}
            onKeyDown={handlePageInput}
            className="w-10 rounded border border-border bg-surface-2 px-1 py-0.5 text-center text-xs outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            aria-label="Current page"
          />
          <span>/ {numPages}</span>
        </div>

        {/* Fit options */}
        <div className="flex gap-0.5">
          <button
            onClick={onFitWidth}
            className="rounded px-2 py-0.5 text-xs text-foreground-muted hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring cursor-pointer"
          >
            Fit width
          </button>
          <button
            onClick={onFitPage}
            className="rounded px-2 py-0.5 text-xs text-foreground-muted hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring cursor-pointer"
          >
            Fit page
          </button>
        </div>
      </div>

      {/* Right: eye comfort + checkpoints + more */}
      <div className="flex items-center gap-1">
        {/* Eye comfort mode toggle */}
        {onToggleEyeComfort && (
          <button
            onClick={onToggleEyeComfort}
            className={cn(
              'rounded p-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring cursor-pointer',
              eyeComfortMode
                ? 'bg-primary/10 text-primary hover:bg-primary/20'
                : 'text-foreground-muted hover:bg-surface-2'
            )}
            aria-label={eyeComfortMode ? 'Disable eye comfort mode' : 'Enable eye comfort mode'}
            aria-pressed={eyeComfortMode}
          >
            {eyeComfortMode
              ? <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
              : <Eye className="h-3.5 w-3.5" aria-hidden="true" />
            }
          </button>
        )}

        {/* Checkpoints dropdown */}
        {recentCheckpoints.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="rounded p-1.5 hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring cursor-pointer text-foreground-muted"
                aria-label="Reading checkpoints"
              >
                <Bookmark className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="text-xs text-foreground-muted">
                Saved positions
              </DropdownMenuLabel>
              {recentCheckpoints.map((cp, i) => (
                <DropdownMenuItem
                  key={i}
                  onSelect={() => onPageChange(cp.page)}
                  className="text-sm"
                >
                  <span className="flex-1">
                    Page <span className="font-mono">{cp.page}</span>
                  </span>
                  <span className="text-xs font-mono text-foreground-subtle">
                    {formatDistanceToNow(new Date(cp.savedAt), { addSuffix: true })}
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {/* More menu */}
        {(onExportToCornell || onToggleComprehension) && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="rounded p-1.5 hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring cursor-pointer text-foreground-muted"
                aria-label="More options"
              >
                <MoreHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              {onExportToCornell && annotationCount > 0 && (
                <>
                  <DropdownMenuItem onSelect={onExportToCornell} className="text-sm gap-2">
                    <FileText className="h-3.5 w-3.5 text-foreground-muted" aria-hidden="true" />
                    Export all highlights to Cornell note
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              {onToggleComprehension && (
                <DropdownMenuItem onSelect={onToggleComprehension} className="text-sm gap-2">
                  <CheckSquare className="h-3.5 w-3.5 text-foreground-muted" aria-hidden="true" />
                  {comprehensionEnabled ? 'Disable' : 'Enable'} comprehension checkpoints
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
}
