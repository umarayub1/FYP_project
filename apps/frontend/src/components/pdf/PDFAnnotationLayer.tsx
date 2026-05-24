'use client';

import { useState } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/cn';

export interface Annotation {
  id: string;
  pageNumber: number;
  rects: { x: number; y: number; width: number; height: number }[];
  text: string;
  cardId?: string;
  cardNumber?: number;
}

interface PDFAnnotationLayerProps {
  annotations: Annotation[];
  pageNumber: number;
  pageWidth: number;
  pageHeight: number;
  studySetId?: string;
}

export function PDFAnnotationLayer({ annotations, pageNumber, pageWidth, pageHeight, studySetId }: PDFAnnotationLayerProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const pageAnnotations = annotations.filter(a => a.pageNumber === pageNumber);

  if (pageAnnotations.length === 0) return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0"
      style={{ width: pageWidth, height: pageHeight }}
    >
      {pageAnnotations.map((ann, annIdx) => {
        const hovered = hoveredId === ann.id;
        const displayNumber = ann.cardNumber ?? annIdx + 1;

        return ann.rects.map((rect, rectIdx) => (
          <div
            key={`${ann.id}-${rectIdx}`}
            className="absolute pointer-events-auto"
            style={{
              left:   rect.x * pageWidth,
              top:    rect.y * pageHeight,
              width:  rect.width * pageWidth,
              height: rect.height * pageHeight,
            }}
            onMouseEnter={() => setHoveredId(ann.id)}
            onMouseLeave={() => setHoveredId(null)}
          >
            {/* Underline highlight */}
            <div
              className={cn(
                'absolute bottom-0 left-0 right-0 h-0.5 transition-opacity',
                hovered ? 'bg-primary/70' : 'bg-primary/30'
              )}
            />

            {/* Right-margin numbered circle — only on first rect of each annotation */}
            {rectIdx === 0 && (
              <div
                className="absolute -right-6 top-1/2 -translate-y-1/2 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[8px] font-mono font-medium text-white leading-none select-none"
                title={`Annotation ${displayNumber}`}
              >
                {displayNumber}
              </div>
            )}

            {/* HoverCard */}
            {hovered && rectIdx === 0 && (
              <div className="absolute bottom-full mb-2 left-0 z-50 w-56 rounded-lg border border-border bg-background shadow-lg p-3 pointer-events-auto">
                {ann.cardNumber && (
                  <p className="text-[10px] font-medium uppercase tracking-wider text-foreground-subtle mb-1.5">
                    Card #{ann.cardNumber}
                  </p>
                )}
                <p className="text-xs text-foreground leading-relaxed line-clamp-3">
                  {ann.text.slice(0, 120)}{ann.text.length > 120 ? '…' : ''}
                </p>
                {ann.cardId && studySetId && (
                  <Link
                    href={`/sets/${studySetId}/flashcards#card-${ann.cardId}`}
                    className="mt-2 flex items-center gap-1 text-xs text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring rounded"
                  >
                    Go to flashcard →
                  </Link>
                )}
              </div>
            )}
          </div>
        ));
      })}
    </div>
  );
}
