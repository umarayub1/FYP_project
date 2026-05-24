'use client';

import { useState, useEffect, useCallback, memo } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { gatewayGet, gatewayDelete } from '@/lib/api/gateway';
import { API_ROUTES } from '@/lib/api/keys';
import { formatRelative } from '@/lib/format/date';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/cn';

export interface Conversation {
  _id: string;
  title: string;
  updatedAt: string;
  studySetId?: string;
}

interface ConversationsSidebarProps {
  studySetId: string;
  activeConversationId: string | null;
  onSelectConversation: (id: string) => void;
  onNewConversation: () => void;
  onDeleteConversation?: (id: string, conversation: Conversation) => void;
  refreshKey?: number;
}

interface ConversationItemProps {
  conversation: Conversation;
  isActive: boolean;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function groupConversations(conversations: Conversation[]) {
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);

  const groups: { label: string; items: Conversation[] }[] = [
    { label: 'Today', items: [] },
    { label: 'Yesterday', items: [] },
    { label: 'Older', items: [] },
  ];

  for (const c of conversations) {
    const date = new Date(c.updatedAt);
    if (isSameDay(date, now)) groups[0].items.push(c);
    else if (isSameDay(date, yesterday)) groups[1].items.push(c);
    else groups[2].items.push(c);
  }

  return groups.filter(g => g.items.length > 0);
}

const ConversationItem = memo(function ConversationItem({
  conversation,
  isActive,
  onSelect,
  onDelete,
}: ConversationItemProps) {
  return (
    <div
      className={cn(
        'group flex items-center gap-2 px-2 py-1.5 rounded-[var(--radius-md)] cursor-pointer transition-colors duration-[80ms]',
        isActive ? 'bg-[hsl(var(--surface-2))]' : 'hover:bg-[hsl(var(--surface))]'
      )}
      onClick={() => onSelect(conversation._id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onSelect(conversation._id)}
    >
      <span className="flex-1 text-xs truncate text-foreground">{conversation.title}</span>
      <span className="text-[10px] font-mono text-[hsl(var(--foreground-subtle))] shrink-0 hidden group-hover:hidden">
        {formatRelative(conversation.updatedAt)}
      </span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-0.5 rounded hover:bg-[hsl(var(--surface-3))] shrink-0"
            aria-label="Conversation options"
            onClick={(e) => e.stopPropagation()}
          >
            <MoreHorizontal size={12} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem
            onClick={(e) => { e.stopPropagation(); onDelete(conversation._id); }}
            className="text-[hsl(var(--danger))]"
          >
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
});
ConversationItem.displayName = 'ConversationItem';

export function ConversationsSidebar({
  studySetId,
  activeConversationId,
  onSelectConversation,
  onNewConversation,
  onDeleteConversation,
  refreshKey = 0,
}: ConversationsSidebarProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);

  const load = useCallback(() => {
    if (!studySetId) { setConversations([]); return; }
    gatewayGet<Conversation[]>(API_ROUTES.coachConversations(studySetId))
      .then(setConversations)
      .catch(() => setConversations([]));
  }, [studySetId]);

  useEffect(() => { load(); }, [load, refreshKey]);

  const handleDelete = useCallback((id: string) => {
    const convo = conversations.find((c) => c._id === id);
    setConversations((prev) => prev.filter((c) => c._id !== id));
    if (onDeleteConversation && convo) {
      onDeleteConversation(id, convo);
    } else {
      gatewayDelete(`/coach/conversations/${id}`).catch(() => {});
    }
  }, [conversations, onDeleteConversation]);

  const groups = groupConversations(conversations);

  return (
    <aside
      className="w-56 flex-shrink-0 border-r border-[hsl(var(--border))] h-full flex flex-col"
      aria-label="Conversation history"
    >
      <div className="p-3 border-b border-[hsl(var(--border))]">
        <button
          onClick={onNewConversation}
          className="w-full text-left text-xs px-3 py-2 rounded-[var(--radius-md)] bg-[hsl(var(--primary))] text-[hsl(var(--primary-fg))] hover:opacity-90 transition-opacity duration-[80ms] font-medium"
        >
          + New conversation
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto py-2" aria-label="Conversations">
        {groups.length === 0 ? (
          <p className="text-xs text-[hsl(var(--foreground-subtle))] px-4 py-4">
            No conversations yet.
          </p>
        ) : (
          groups.map(group => (
            <div key={group.label} className="mb-3">
              <p className="px-4 pb-1 text-[10px] font-medium uppercase tracking-wider text-[hsl(var(--foreground-subtle))]">
                {group.label}
              </p>
              <div className="px-2 space-y-0.5">
                {group.items.map(convo => (
                  <ConversationItem
                    key={convo._id}
                    conversation={convo}
                    isActive={convo._id === activeConversationId}
                    onSelect={onSelectConversation}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </nav>
    </aside>
  );
}
