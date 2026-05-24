'use client';

import { useState, useRef, useEffect } from 'react';
import { MessageCircle, Send, Loader2 } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { useSSEChat } from '@/hooks/useSSEChat';
import { cn } from '@/lib/cn';

interface CoachMiniPopoverProps {
  studySetId: string;
}

export function CoachMiniPopover({ studySetId }: CoachMiniPopoverProps) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const { messages, streaming, send, clear } = useSSEChat(studySetId);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => inputRef.current?.focus());
    } else {
      clear();
      setInput('');
    }
  }, [open, clear]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || streaming) return;
    setInput('');
    void send(text);
  }

  const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant');
  const lastUser      = [...messages].reverse().find(m => m.role === 'user');

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Ask Coach"
          title="Ask Coach"
          className={cn(
            'fixed bottom-6 right-6 z-30 flex items-center gap-2 rounded-full',
            'bg-primary text-primary-foreground shadow-lg px-4 h-11',
            'hover:bg-primary-hover transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
          )}
        >
          <MessageCircle className="h-4 w-4" aria-hidden="true" />
          <span className="text-sm font-medium">Ask Coach</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="end"
        sideOffset={12}
        className="w-[360px] max-w-[calc(100vw-2rem)] p-0"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          inputRef.current?.focus();
        }}
      >
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <div className="flex items-center gap-2">
            <MessageCircle className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
            <span className="text-xs font-medium text-foreground">Coach Mini</span>
          </div>
          <span className="text-[10px] font-mono text-foreground-subtle">
            Esc to close
          </span>
        </div>

        <div
          ref={scrollRef}
          className="max-h-64 overflow-y-auto px-3 py-3 text-sm"
          aria-live="polite"
        >
          {messages.length === 0 ? (
            <p className="text-xs text-foreground-muted">
              Ask a quick question about the topic you&apos;re explaining. Single turn — your Feynman session keeps going.
            </p>
          ) : (
            <>
              {lastUser && (
                <p className="mb-2 text-xs text-foreground-muted">
                  <span className="font-medium text-foreground-subtle">You:</span> {lastUser.content}
                </p>
              )}
              {lastAssistant && (
                <p className="whitespace-pre-wrap text-foreground">
                  {lastAssistant.content}
                  {streaming && <span className="ml-1 inline-block animate-pulse">▍</span>}
                </p>
              )}
            </>
          )}
        </div>

        <form onSubmit={handleSubmit} className="flex items-center gap-2 border-t border-border p-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Ask Coach a quick question…"
            aria-label="Ask Coach a quick question"
            disabled={streaming}
            className={cn(
              'flex-1 h-8 rounded-md border border-border bg-surface px-2 text-sm',
              'placeholder:text-foreground-subtle',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
              'disabled:opacity-50',
            )}
          />
          <Button
            type="submit"
            size="sm"
            disabled={!input.trim() || streaming}
            aria-label="Send"
          >
            {streaming
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              : <Send className="h-3.5 w-3.5" aria-hidden="true" />
            }
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
