'use client';

import Link from 'next/link';
import { X } from 'lucide-react';
import { type Tag } from '@/lib/api/tags';
import { cn } from '@/lib/cn';

interface TagChipProps {
  tag: Tag | string;
  onRemove?: () => void;
  onClick?: () => void;
  size?: 'sm' | 'md';
  asLink?: boolean;
}

export function TagChip({ tag, onRemove, onClick, size = 'sm', asLink = false }: TagChipProps) {
  const name  = typeof tag === 'string' ? tag : tag.name;
  const slug  = typeof tag === 'string' ? name.toLowerCase().replace(/\s+/g, '-') : tag.slug;
  const color = typeof tag === 'string' ? undefined : tag.color;

  const chipClass = cn(
    'inline-flex items-center gap-1.5 rounded-full bg-surface-2 text-foreground-muted font-medium transition-colors',
    'hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
    size === 'sm' && 'text-xs px-2 py-0.5',
    size === 'md' && 'text-sm px-3 py-1',
  );

  const inner = (
    <>
      {color && (
        <span
          className="h-2 w-2 rounded-full shrink-0"
          style={{ backgroundColor: color }}
          aria-hidden="true"
        />
      )}
      {name}
      {onRemove && (
        <button
          onClick={e => { e.stopPropagation(); e.preventDefault(); onRemove(); }}
          className="ml-0.5 rounded-full hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus-ring cursor-pointer"
          aria-label={`Remove tag ${name}`}
        >
          <X className="h-3 w-3" aria-hidden="true" />
        </button>
      )}
    </>
  );

  if (asLink) {
    return (
      <Link href={`/tag/${slug}`} className={chipClass} aria-label={`View tag ${name}`}>
        {inner}
      </Link>
    );
  }

  if (onClick) {
    return (
      <button onClick={onClick} className={chipClass} aria-label={`Tag: ${name}`}>
        {inner}
      </button>
    );
  }

  return <span className={chipClass}>{inner}</span>;
}
