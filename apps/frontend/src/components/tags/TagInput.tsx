'use client';

import { useState, useRef, useEffect, useId } from 'react';
import { type Tag } from '@/lib/api/tags';
import { TagChip } from './TagChip';
import { cn } from '@/lib/cn';

interface TagInputProps {
  value: string[];
  onChange: (tags: string[]) => void;
  suggestions?: Tag[];
  maxTags?: number;
  placeholder?: string;
  id?: string;
}

export function TagInput({
  value,
  onChange,
  suggestions = [],
  maxTags = 10,
  placeholder = 'Add tags…',
  id: idProp,
}: TagInputProps) {
  const [input, setInput] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const filtered = suggestions
    .filter(s => s.name.toLowerCase().includes(input.toLowerCase()) && !value.includes(s.name))
    .slice(0, 8);

  const atLimit = value.length >= maxTags;
  const nearLimit = value.length >= maxTags - 2;

  function commit(tag: string) {
    const trimmed = tag.trim().toLowerCase();
    if (!trimmed || value.includes(trimmed) || atLimit) return;
    onChange([...value, trimmed]);
    setInput('');
    setDropdownOpen(false);
    setActiveIndex(-1);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (activeIndex >= 0 && filtered[activeIndex]) {
        commit(filtered[activeIndex].name);
      } else {
        commit(input);
      }
    } else if (e.key === 'Backspace' && input === '' && value.length > 0) {
      onChange(value.slice(0, -1));
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(i => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(i => Math.max(i - 1, -1));
    } else if (e.key === 'Escape') {
      setDropdownOpen(false);
      setActiveIndex(-1);
    }
  }

  useEffect(() => {
    setDropdownOpen(input.length > 0 && filtered.length > 0);
    setActiveIndex(-1);
  }, [input, filtered.length]);

  return (
    <div role="group" aria-label="Tag input">
      <div
        className={cn(
          'flex flex-wrap items-center gap-1.5 rounded-md border border-border bg-surface-2 px-3 py-2',
          'focus-within:ring-2 focus-within:ring-focus-ring',
          atLimit && 'opacity-60'
        )}
        onClick={() => inputRef.current?.focus()}
      >
        {value.map(tag => (
          <TagChip
            key={tag}
            tag={tag}
            onRemove={() => onChange(value.filter(t => t !== tag))}
            size="sm"
          />
        ))}
        {!atLimit && (
          <input
            ref={inputRef}
            id={idProp}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => input.length > 0 && filtered.length > 0 && setDropdownOpen(true)}
            onBlur={() => setTimeout(() => setDropdownOpen(false), 150)}
            placeholder={value.length === 0 ? placeholder : ''}
            className="flex-1 min-w-20 bg-transparent text-sm text-foreground placeholder:text-foreground-subtle outline-none"
            aria-label="Tag input"
            role="combobox"
            aria-expanded={dropdownOpen}
            aria-controls={dropdownOpen ? listId : undefined}
            aria-activedescendant={activeIndex >= 0 ? `tag-option-${activeIndex}` : undefined}
            aria-autocomplete="list"
            disabled={atLimit}
          />
        )}
      </div>

      {nearLimit && !atLimit && (
        <p className="mt-1 text-xs text-warning">{value.length}/{maxTags} tags used</p>
      )}
      {atLimit && (
        <p className="mt-1 text-xs text-foreground-muted">Tag limit reached ({maxTags})</p>
      )}

      {/* Autocomplete dropdown */}
      {dropdownOpen && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Tag suggestions"
          className="mt-1 z-50 rounded-md border border-border bg-background shadow-lg max-h-40 overflow-y-auto"
        >
          {filtered.map((tag, i) => (
            <li
              key={tag._id}
              id={`tag-option-${i}`}
              role="option"
              aria-selected={i === activeIndex}
              onMouseDown={e => { e.preventDefault(); commit(tag.name); }}
              className={cn(
                'flex items-center gap-2 px-3 py-2 text-sm cursor-pointer',
                i === activeIndex ? 'bg-primary-soft text-primary' : 'text-foreground hover:bg-surface-2'
              )}
            >
              {tag.color && (
                <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: tag.color }} aria-hidden="true" />
              )}
              {tag.name}
              <span className="ml-auto text-xs text-foreground-subtle">{tag.usageCount}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
