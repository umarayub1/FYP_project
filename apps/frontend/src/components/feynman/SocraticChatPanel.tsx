'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { MessageCircleQuestion, Send, X, Bot, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { renderMarkdownWithMath } from '@/lib/markdown/render';
import { feynmanSocraticChat, type SocraticChatMessage, type CoverageChunk } from '@/lib/api/feynman';
import { TextareaSlashMenu } from '@/components/editor/TextareaSlashMenu';
import { useTextareaSlashMenu } from '@/hooks/useTextareaSlashMenu';

interface SocraticChatPanelProps {
  /**
   * Controls panel render. When false, the component returns null and is
   * mounted by the host so closing/re-opening preserves state.
   */
  open:      boolean;
  onClose:   () => void;
  sessionId: string;
  topic:     string;
  /**
   * Current rubric coverage — drives the suggestion chips so they nudge the
   * student toward the actual gaps in their explanation, not generic prompts.
   */
  coverage?: CoverageChunk[];
  /**
   * When the user sends a message, the host folds the message text into the
   * canvas explanation so the rubric grades the chat content too.
   */
  onUserTurn?: (text: string) => void;
}

const FALLBACK_SUGGESTIONS: string[] = [
  "I'm stuck — where do I start?",
  "Quiz me on what I've written so far",
  "What's the most common misconception here?",
];

/**
 * Build prompts the user can drop into the composer. When coverage is
 * available, prefer chips that target gaps — "Try to explain X" for missing,
 * "Sharpen my answer on X" for partial. Falls back to generic cold-start
 * chips when there's no coverage signal yet.
 *
 * Phrased in the student's voice — they're the one sending these to the tutor.
 */
function buildSuggestions(coverage: CoverageChunk[] | undefined): string[] {
  const missing = (coverage ?? []).filter(c => c.status === 'missing').map(c => c.label);
  const partial = (coverage ?? []).filter(c => c.status === 'partial').map(c => c.label);
  if (missing.length === 0 && partial.length === 0) {
    return FALLBACK_SUGGESTIONS;
  }
  const chips: string[] = [];
  // Lead with two missing if available, then one partial — gives users a
  // clear "what should I work on next" path.
  for (const m of missing.slice(0, 2)) chips.push(`Try to explain ${m}`);
  for (const p of partial.slice(0, 1)) chips.push(`Sharpen my answer on ${p}`);
  // Always include one meta-prompt so the user has a generic escape hatch.
  chips.push("Quiz me on what I've covered so far");
  return chips.slice(0, 3);
}

/**
 * Dedicated Socratic-mode chat for a Feynman session.
 *
 * Distinct from the Coach: this tutor only asks questions (server-side
 * prompt constrained to SOCRATIC_SYSTEM) and is always scoped to the
 * current Feynman topic + source. Renders as an in-place panel that
 * replaces the editor while open — coverage column stays visible so the
 * user can watch the grade move as they chat.
 */
export function SocraticChatPanel({ open, onClose, sessionId, topic, coverage, onUserTurn }: SocraticChatPanelProps) {
  const [messages, setMessages] = useState<SocraticChatMessage[]>([]);
  const [input, setInput]       = useState('');
  const [busy, setBusy]         = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const inputRef    = useRef<HTMLTextAreaElement>(null);

  // Slash-menu snippets — same hook as the Feynman canvas, same math-context
  // smarts. Chat composer is a multi-line Markdown surface too.
  const slashMenu = useTextareaSlashMenu({
    value: input,
    setValue: setInput,
    textareaRef: inputRef,
  });

  // Live preview of the in-progress message. Only show when there's something
  // worth previewing — plain prose doesn't need a duplicate render hovering.
  const inputHasMarkup = /[$*_`#>~\\]|\[\d+\]/.test(input);
  const previewHtml = useMemo(
    () => (inputHasMarkup ? renderMarkdownWithMath(input) : ''),
    [input, inputHasMarkup],
  );

  // Focus the input when the modal opens; auto-scroll when messages change.
  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);
  useEffect(() => {
    scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);

  // Esc no longer closes (it would conflict with the slash-menu and feel
  // surprising as part of the page layout). Close button in the header is
  // the explicit close path.

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setError(null);
    const userTurn: SocraticChatMessage = { role: 'user', content: text };
    const nextHistory = [...messages, userTurn];
    setMessages(nextHistory);
    setInput('');
    onUserTurn?.(text);
    setBusy(true);
    try {
      const res = await feynmanSocraticChat(sessionId, text, messages);
      setMessages([...nextHistory, { role: 'assistant', content: res.question }]);
    } catch {
      setError('Could not reach the tutor. Try again in a moment.');
      // Roll back the optimistic user turn so retry doesn't duplicate it.
      setMessages(messages);
      setInput(text);
    } finally {
      setBusy(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Slash menu gets first crack at arrows/Enter/Esc — bails to here when
    // it doesn't apply.
    if (slashMenu.onKeyDown(e)) return;
    // ⌘/Ctrl + Enter to send, plain Enter is a newline.
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void send();
    }
  }

  if (!open) return null;

  return (
    <section
      className="relative flex flex-col h-full bg-background overflow-hidden"
      aria-label="Socratic skeptic chat"
    >
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-surface-2/50">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
              <MessageCircleQuestion className="h-4 w-4 text-primary" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-sm font-medium text-foreground">Socratic Skeptic</h2>
              <p className="text-[11px] text-foreground-muted">
                Asks questions to sharpen your explanation — won&apos;t answer for you.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close chat"
            className="rounded p-1 text-foreground-muted hover:text-foreground hover:bg-surface-3 transition-colors"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Message list */}
        <div ref={scrollerRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {messages.length === 0 && !busy && (
            <div className="space-y-3">
              <div className="rounded-md border border-dashed border-border p-4 text-center text-foreground-subtle text-sm">
                <p className="mb-1">Topic: <span className="text-foreground">{topic}</span></p>
                <p>Say what you&apos;re thinking. The tutor will probe with one question at a time.</p>
              </div>
              {/* Coverage-driven chips — when the rubric knows what's missing
                  or partial, the chips become "Try to explain X" prompts that
                  push the student toward the actual gaps. Falls back to
                  generic prompts before any evaluate has fired. */}
              <div className="flex flex-wrap gap-2 justify-center">
                {buildSuggestions(coverage).map(s => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => {
                      setInput(s);
                      requestAnimationFrame(() => inputRef.current?.focus());
                    }}
                    className="rounded-full border border-border bg-surface-2 px-3 py-1 text-[12px] text-foreground-muted hover:text-foreground hover:bg-surface-3 transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m, i) => (
            <MessageBubble key={i} msg={m} />
          ))}
          {busy && (
            <div className="flex items-center gap-2 text-foreground-subtle text-xs">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-surface-3">
                <Bot className="h-3 w-3" aria-hidden="true" />
              </div>
              <span className="italic">Thinking of a sharp question…</span>
            </div>
          )}
          {error && (
            <p role="alert" className="text-xs text-danger px-1">{error}</p>
          )}
        </div>

        {/* Live preview popover — appears above the composer when there's
            markdown-y content to show. Plain prose hides it so the chat
            stays clean. */}
        {previewHtml && !slashMenu.open && (
          <div
            className="mx-3 mb-1 rounded-md border border-border bg-surface-2/80 px-3 py-1.5"
            aria-hidden="true"
          >
            <div className="text-[10px] uppercase tracking-wider text-foreground-subtle font-mono mb-0.5">
              Preview
            </div>
            <div
              className="prose prose-sm prose-invert max-w-none prose-p:my-0.5 prose-strong:text-foreground prose-em:text-foreground"
              dangerouslySetInnerHTML={{ __html: previewHtml }}
            />
          </div>
        )}

        {/* Composer */}
        <div className="border-t border-border bg-surface-2/40 px-3 py-2">
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                slashMenu.onTextChange(e.target.value, e.target.selectionStart);
              }}
              onKeyDown={handleKeyDown}
              onBlur={() => slashMenu.closeMenu()}
              placeholder="Type your thought… (/ for snippets · ⌘↵ to send)"
              rows={2}
              disabled={busy}
              className={cn(
                'flex-1 resize-none bg-transparent text-sm text-foreground placeholder:text-foreground-subtle',
                'outline-none px-2 py-1 max-h-[120px]',
                'disabled:opacity-50',
              )}
              aria-label="Reply to the tutor"
            />
            <Button
              size="icon"
              onClick={() => void send()}
              disabled={!input.trim() || busy}
              aria-label="Send"
              className="h-8 w-8 shrink-0"
            >
              <Send className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          </div>
        </div>
      </div>

      {/* Slash-menu portal for the composer. */}
      <TextareaSlashMenu {...slashMenu.menuProps} />
    </section>
  );
}

function MessageBubble({ msg }: { msg: SocraticChatMessage }) {
  // Render BOTH user and assistant turns as compiled markdown — what you
  // typed in the composer (with bolds, math, lists) should look the same
  // in the message bubble, not regress to raw text.
  const html = useMemo(() => renderMarkdownWithMath(msg.content), [msg.content]);
  const isUser = msg.role === 'user';
  return (
    <div className={cn('flex gap-2', isUser && 'flex-row-reverse')}>
      <div
        className={cn(
          'flex h-6 w-6 shrink-0 items-center justify-center rounded-full mt-0.5',
          isUser ? 'bg-primary text-primary-fg' : 'bg-surface-3 text-foreground-muted',
        )}
        aria-hidden="true"
      >
        {isUser ? <User className="h-3 w-3" /> : <Bot className="h-3 w-3" />}
      </div>
      <div
        className={cn(
          'rounded-lg px-3 py-2 text-sm leading-relaxed max-w-[80%]',
          isUser
            ? 'bg-primary text-primary-fg rounded-tr-sm'
            : 'bg-surface-2 text-foreground rounded-tl-sm',
        )}
      >
        <div
          className={cn(
            'prose prose-sm max-w-none prose-p:my-1',
            // User bubbles are on a coloured background, so default prose
            // colour overrides need to flip; assistant bubble is on neutral.
            isUser
              ? 'prose-invert prose-strong:text-primary-fg prose-em:text-primary-fg prose-a:text-primary-fg prose-code:text-primary-fg prose-code:bg-white/15'
              : 'prose-invert prose-strong:text-foreground prose-em:text-foreground prose-code:text-foreground prose-code:bg-surface-3',
            "prose-code:rounded prose-code:px-1 prose-code:before:content-none prose-code:after:content-none",
          )}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </div>
  );
}
