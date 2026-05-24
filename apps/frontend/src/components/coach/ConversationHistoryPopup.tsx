'use client';

import { useEffect, useRef, useState } from 'react';
import { Search, MessageSquarePlus, MoreHorizontal, Clock } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { Conversation } from '@/components/coach/ConversationsSidebar';

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function groupLabel(updatedAt: string): 'Today' | 'Yesterday' | 'Older' {
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const date = new Date(updatedAt);
  if (isSameDay(date, now)) return 'Today';
  if (isSameDay(date, yesterday)) return 'Yesterday';
  return 'Older';
}

function formatTime(updatedAt: string) {
  const date = new Date(updatedAt);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

interface ConversationHistoryPopupProps {
  open: boolean;
  onClose: () => void;
  conversations: Conversation[];
  activeConversationId: string | null;
  onSelectConversation: (id: string) => void;
  onNewConversation: () => void;
  onDeleteConversation?: (id: string) => void;
}

export function ConversationHistoryPopup({
  open,
  onClose,
  conversations,
  activeConversationId,
  onSelectConversation,
  onNewConversation,
  onDeleteConversation,
}: ConversationHistoryPopupProps) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  const filtered = query.trim()
    ? conversations.filter(c => c.title.toLowerCase().includes(query.toLowerCase()))
    : conversations;

  // Group filtered conversations
  const groups: { label: string; items: Conversation[] }[] = [
    { label: 'Today', items: [] },
    { label: 'Yesterday', items: [] },
    { label: 'Older', items: [] },
  ];
  for (const c of filtered) {
    const label = groupLabel(c.updatedAt);
    groups.find(g => g.label === label)!.items.push(c);
  }
  const visibleGroups = groups.filter(g => g.items.length > 0);

  const handleSelect = (id: string) => {
    onSelectConversation(id);
    onClose();
  };

  const handleNew = () => {
    onNewConversation();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[200]"
      onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-[2px] animate-in fade-in-0 duration-100"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Popup */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Conversation history"
        className="relative mx-auto mt-[12vh] w-[calc(100%-2rem)] max-w-md rounded-xl border border-border bg-background shadow-2xl animate-in fade-in-0 zoom-in-95 duration-100"
      >
        {/* Search */}
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <Search className="h-4 w-4 shrink-0 text-foreground-subtle" aria-hidden="true" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search conversations…"
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-foreground-subtle focus:outline-none"
          />
          <kbd className="hidden sm:flex items-center rounded border border-border bg-surface-2 px-1.5 py-0.5 text-[10px] font-mono text-foreground-subtle">
            Esc
          </kbd>
        </div>

        {/* New conversation */}
        <div className="border-b border-border px-2 py-1.5">
          <button
            onClick={handleNew}
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-foreground hover:bg-primary/8 hover:text-primary transition-colors cursor-pointer"
          >
            <MessageSquarePlus className="h-4 w-4 shrink-0" aria-hidden="true" />
            New conversation
          </button>
        </div>

        {/* Conversation list */}
        <div className="max-h-[min(50vh,360px)] overflow-y-auto overscroll-contain p-1.5">
          {filtered.length === 0 ? (
            <div className="py-10 text-center text-sm text-foreground-subtle">
              {query ? 'No conversations match your search.' : 'No conversations yet.'}
            </div>
          ) : (
            visibleGroups.map(group => (
              <div key={group.label} className="mb-2">
                <p className="px-3 py-1 text-[10px] font-medium uppercase tracking-wider text-foreground-subtle">
                  {group.label}
                </p>
                {group.items.map(convo => (
                  <div
                    key={convo._id}
                    className={cn(
                      'group flex items-center gap-3 rounded-md px-3 py-2 cursor-pointer transition-colors',
                      convo._id === activeConversationId
                        ? 'bg-primary/8 text-primary'
                        : 'text-foreground hover:bg-surface-2'
                    )}
                    onClick={() => handleSelect(convo._id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={e => e.key === 'Enter' && handleSelect(convo._id)}
                  >
                    <Clock className="h-3.5 w-3.5 shrink-0 text-foreground-subtle" aria-hidden="true" />
                    <span className="flex-1 text-sm truncate">{convo.title}</span>
                    <span className="text-[10px] font-mono text-foreground-subtle shrink-0">
                      {formatTime(convo.updatedAt)}
                    </span>
                    {onDeleteConversation && (
                      <button
                        className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-surface-3 text-foreground-subtle hover:text-danger transition-colors"
                        aria-label="Delete conversation"
                        onClick={e => {
                          e.stopPropagation();
                          onDeleteConversation(convo._id);
                        }}
                      >
                        <MoreHorizontal className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border px-4 py-2 flex items-center gap-4 text-[10px] text-foreground-subtle">
          <span className="flex items-center gap-1"><kbd className="font-mono">↑↓</kbd> navigate</span>
          <span className="flex items-center gap-1"><kbd className="font-mono">↵</kbd> open</span>
          <span className="flex items-center gap-1"><kbd className="font-mono">Esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}
