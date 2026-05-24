'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Send, AlertTriangle, Bot, User, History, Maximize2, Square,
  Copy, Check, SquarePen, FileText, X, ChevronDown, RefreshCw, Layers, MessageCircle,
} from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { useSSEChat, type SendOptions, type Citation, type ChatStage } from '@/hooks/useSSEChat';
import { NoCitationsCallout } from '@/components/coach/NoCitationsCallout';
import { SourcesSection } from '@/components/coach/SourcesSection';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useModKey } from '@/hooks/usePlatform';
import { cn } from '@/lib/cn';
import { gatewayGet, gatewayPost, gatewayDelete } from '@/lib/api/gateway';
import { getDocuments, type SynapseDocument } from '@/lib/api/documents';
import { renderMarkdownWithCitations } from '@/lib/markdown/render';
import { ConversationsSidebar, type Conversation } from '@/components/coach/ConversationsSidebar';
import { ConversationHistoryPopup } from '@/components/coach/ConversationHistoryPopup';
import { EmptyState } from '@/components/patterns/EmptyState';
import { useFirstTimeHint } from '@/hooks/useFirstTimeHint';
import { FirstTimeHint } from '@/components/patterns/FirstTimeHint';
import { useAIStatus } from '@/contexts/AIStatusContext';
import { FlashcardEditDialog } from '@/components/flashcards/FlashcardEditDialog';
import type { Flashcard } from '@/lib/api/flashcards';
import { useStagingContext } from '@/contexts/StagingContext';
import {
  UniversalContextMenu,
  type UniversalMenuAction,
} from '@/components/staging/UniversalContextMenu';

/* ─── Types ────────────────────────────────────────────────────────────────── */

interface MentionChip {
  id:       string;
  name:     string;
  deleted?: boolean;
}

export interface LeechCardContext {
  _id:        string;
  studySetId: string;
  cardType:   'basic' | 'bidirectional' | 'cloze';
  front:      string;
  back:       string;
  clozeBody?: string;
  tags:       string[];
  againCount?: number;
}

interface CoachChatProps {
  studySetId?:    string;
  studySetName?:  string;
  fullPage?:      boolean;
  /** When set, renders a leech-card banner and auto-sends `initialMessage`. */
  cardContext?:   LeechCardContext;
  initialMessage?: string;
}

interface ConversationDetail {
  _id:      string;
  title:    string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
}

/* ─── Constants ─────────────────────────────────────────────────────────────── */

const SLASH_COMMANDS = [
  { id: 'quiz',  label: 'Generate comprehension questions' },
  { id: 'plan',  label: 'Create a study plan from your data' },
  { id: 'batch', label: 'Generate flashcards from a document' },
] as const;

const EXAMPLE_CHIPS = [
  'What are the key concepts?',
  'Quiz me on this set',
  'Make a study plan for my exam',
];

/* ─── Assistant bubble content ──────────────────────────────────────────────── */

/**
 * Renders an assistant message as proper markdown (with KaTeX math) and turns
 * citation tokens `[N]` into visible chips. The detailed-per-source view lives
 * in the collapsible `SourcesSection` below the bubble — the inline chips are
 * just visual references back to it.
 */
function AssistantBubbleContent({ content }: { content: string }) {
  const html = useMemo(() => renderMarkdownWithCitations(content), [content]);
  return (
    <div
      className={cn(
        'prose prose-sm prose-invert max-w-none',
        // Tighten the prose defaults so chat bubbles don't feel like blog posts.
        'prose-p:my-1 prose-p:leading-relaxed',
        'prose-ul:my-1 prose-ol:my-1 prose-li:my-0',
        'prose-headings:text-foreground prose-headings:font-medium prose-headings:mt-3 prose-headings:mb-1',
        'prose-strong:text-foreground prose-em:text-foreground',
        // Strip the prose-default backticks around inline code so it reads cleanly.
        "prose-code:text-foreground prose-code:bg-surface-3 prose-code:rounded prose-code:px-1 prose-code:before:content-none prose-code:after:content-none",
        'prose-pre:bg-background prose-pre:border prose-pre:border-border',
        'prose-a:text-primary prose-a:no-underline hover:prose-a:underline',
      )}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

/* ─── MessageBubble ─────────────────────────────────────────────────────────── */

function StageStrip({ stages, streaming }: { stages: ChatStage[]; streaming: boolean }) {
  if (stages.length === 0) return null;
  const activeIdx = streaming ? stages.length - 1 : -1;
  return (
    <div
      className="flex flex-wrap items-center gap-1.5 text-[11px] text-foreground-subtle"
      role="status"
      aria-live="polite"
    >
      {stages.map((s, i) => {
        const isActive = i === activeIdx;
        const isDone   = i < activeIdx || !streaming;
        return (
          <span key={s.stage} className="inline-flex items-center gap-1">
            <span
              className={cn(
                'inline-block h-1.5 w-1.5 rounded-full',
                isActive ? 'bg-primary animate-pulse'
                  : isDone ? 'bg-primary/50'
                  : 'bg-surface-3',
              )}
              aria-hidden="true"
            />
            <span className={cn('font-mono', isActive && 'text-foreground-muted')}>
              {s.label}
            </span>
            {i < stages.length - 1 && (
              <span className="text-foreground-subtle/60" aria-hidden="true">·</span>
            )}
          </span>
        );
      })}
    </div>
  );
}

function MessageBubble({
  role,
  content,
  citations,
  isStreaming,
  isPlanResponse,
  studySetId,
  onRegenerate,
  noRetrieval,
  socratic,
  stages,
}: {
  role:            'user' | 'assistant';
  content:         string;
  citations?:      Citation[];
  isStreaming?:    boolean;
  isPlanResponse?: boolean;
  studySetId?:     string;
  onRegenerate?:   () => void;
  noRetrieval?:    boolean;
  socratic?:       boolean;
  stages?:         ChatStage[];
}) {
  const isUser = role === 'user';
  const [copied, setCopied]               = useState(false);
  const [exportingCornell, setExportingCornell] = useState(false);
  const staging = useStagingContext();
  const bubbleRef = useRef<HTMLDivElement>(null);
  const [bubbleMenu, setBubbleMenu] = useState<{ rect: DOMRect; text: string } | null>(null);

  const stageWholeResponse = (kind: 'card' | 'cornell-row') => {
    if (!studySetId || !content) return;
    staging.stage(kind, { text: content, studySetId, sourceTitle: 'Smart Coach' });
    toast.success(
      kind === 'card' ? 'Staged to Flashcards.' : 'Staged to Cornell.',
    );
  };

  const handleBubbleMouseUp = () => {
    if (isUser || isStreaming) return;
    setTimeout(() => {
      const sel = window.getSelection();
      const text = sel?.toString().trim() ?? '';
      if (!text || !sel || sel.rangeCount === 0) { setBubbleMenu(null); return; }
      const node = bubbleRef.current;
      if (!node || !node.contains(sel.getRangeAt(0).commonAncestorContainer)) {
        setBubbleMenu(null);
        return;
      }
      const rect = sel.getRangeAt(0).getBoundingClientRect();
      setBubbleMenu({ rect, text });
    }, 0);
  };

  const handleSelectionAction = (action: UniversalMenuAction, text: string) => {
    if (!studySetId) return;
    const payload = { text, studySetId, sourceTitle: 'Smart Coach' };
    if (action === 'stage-card')         staging.stage('card', payload);
    else if (action === 'stage-cornell') staging.stage('cornell-row', payload);
    else if (action === 'quote-link')    staging.stage('cornell-row', payload);
  };

  const handleCopy = () => {
    if (!content) return;
    navigator.clipboard.writeText(content).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExportCornell = async () => {
    if (!studySetId || !content) return;
    setExportingCornell(true);
    try {
      await gatewayPost(`/study-sets/${studySetId}/notes`, {
        title:    'Study Plan',
        content:  {
          type:    'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: content }] }],
        },
        isCornell: true,
      });
      toast.success('Exported to Cornell notes');
    } catch {
      toast.error('Failed to export plan');
    } finally {
      setExportingCornell(false);
    }
  };

  return (
    <div className={cn('group flex gap-2.5', isUser && 'flex-row-reverse')}>
      {/* Avatar */}
      <div
        className={cn(
          'flex h-7 w-7 shrink-0 items-center justify-center rounded-full mt-0.5',
          isUser ? 'bg-primary text-primary-fg' : 'bg-surface-3 text-foreground-muted',
        )}
        aria-hidden="true"
      >
        {isUser ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
      </div>

      <div className="flex flex-col gap-1 max-w-[80%]">
        {!isUser && stages && stages.length > 0 && (
          <StageStrip stages={stages} streaming={Boolean(isStreaming) && !content} />
        )}
        {!isUser && noRetrieval && <NoCitationsCallout />}
        {!isUser && socratic && (
          <span
            className="self-start rounded-full bg-primary/12 px-2 py-0.5 text-[10px] font-medium text-primary"
            aria-label="Socratic mode active"
          >
            Socratic
          </span>
        )}
        {/* Bubble */}
        <div
          ref={bubbleRef}
          onMouseUp={handleBubbleMouseUp}
          className={cn(
            'rounded-lg px-3 py-2 text-sm leading-relaxed',
            isUser
              ? 'bg-primary text-primary-fg rounded-tr-sm'
              : 'bg-surface-2 text-foreground rounded-tl-sm',
          )}
        >
          {content ? (
            isUser ? content : <AssistantBubbleContent content={content} />
          ) : isStreaming ? (
            <span
              className="inline-block w-2 h-[1em] bg-current opacity-70 rounded-[1px] animate-pulse"
              aria-label="Thinking…"
            />
          ) : null}
        </div>
        {!isUser && bubbleMenu && (
          <UniversalContextMenu
            open
            rect={bubbleMenu.rect}
            text={bubbleMenu.text}
            variant="coach"
            onAction={handleSelectionAction}
            onDismiss={() => setBubbleMenu(null)}
          />
        )}

        {/* Sources — collapsible list, reliable fallback to the inline [N] chips */}
        {!isUser && content && !isStreaming && citations && citations.length > 0 && (
          <SourcesSection citations={citations} studySetId={studySetId} />
        )}

        {/* Plan: Export to Cornell note */}
        {!isUser && isPlanResponse && content && !isStreaming && (
          <button
            onClick={handleExportCornell}
            disabled={exportingCornell}
            className="self-start text-[11px] text-primary hover:text-primary/80 px-2 py-0.5 rounded border border-primary/20 hover:bg-primary/5 transition-colors disabled:opacity-50"
          >
            {exportingCornell ? 'Exporting…' : 'Export to Cornell note'}
          </button>
        )}

        {/* Hover actions */}
        {!isUser && content && !isStreaming && (
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-foreground-muted hover:text-foreground hover:bg-surface-2 transition-colors"
              aria-label={copied ? 'Copied' : 'Copy message'}
            >
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {copied ? 'Copied' : 'Copy'}
            </button>

            {onRegenerate && (
              <button
                onClick={onRegenerate}
                className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-foreground-muted hover:text-foreground hover:bg-surface-2 transition-colors"
                aria-label="Regenerate response"
              >
                <RefreshCw className="h-3 w-3" />
                Regenerate
              </button>
            )}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[11px] text-foreground-muted hover:text-foreground hover:bg-surface-2 transition-colors">
                  <Layers className="h-3 w-3" />
                  Stage all
                  <ChevronDown className="h-2.5 w-2.5 ml-0.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-[160px]">
                <DropdownMenuItem
                  className="text-xs"
                  onClick={() => stageWholeResponse('card')}
                  disabled={!studySetId}
                >
                  Stage to Flashcards
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-xs"
                  onClick={() => stageWholeResponse('cornell-row')}
                  disabled={!studySetId}
                >
                  Stage to Cornell
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── CoachChat ──────────────────────────────────────────────────────────────── */

export function CoachChat({ studySetId, studySetName, fullPage, cardContext, initialMessage }: CoachChatProps) {
  const { t }    = useTranslation();
  const mod      = useModKey();
  const { messages, streaming, error, send, regenerate, clear, seed, stop } = useSSEChat(studySetId);
  const { shouldShow: showAtHint } = useFirstTimeHint('hint:at-mention');
  const { status: aiStatus } = useAIStatus();
  const aiUnavailable = aiStatus === 'unavailable';
  const { pendingCoachInput, clearPendingCoachInput } = useStagingContext();

  /* Conversation state */
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [conversations, setConversations]               = useState<Conversation[]>([]);
  const [sidebarRefreshKey, setSidebarRefreshKey]       = useState(0);
  const [historyOpen, setHistoryOpen]                   = useState(false);

  /* Input state */
  const [input, setInput]               = useState('');
  const [socratic, setSocratic]         = useState(false);
  const [chips, setChips]               = useState<MentionChip[]>([]);
  const [selectedChipIdx, setSelectedChipIdx] = useState<number | null>(null);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [slashQuery, setSlashQuery]     = useState<string | null>(null);
  const [slashHighlight, setSlashHighlight] = useState(0);

  /* Documents for @-mention */
  const [documents, setDocuments] = useState<SynapseDocument[]>([]);

  /* Refs */
  const bottomRef         = useRef<HTMLDivElement>(null);
  const textareaRef       = useRef<HTMLTextAreaElement>(null);
  const mentionStartRef   = useRef(0);
  const lastSendOptsRef   = useRef<SendOptions>({});
  const pendingDeleteRef  = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const autoSentForCardRef = useRef<string | null>(null);

  /* Leech-card help dialog state */
  const [editCardOpen, setEditCardOpen] = useState(false);

  /* ── Derived ── */
  const visibleSlashCmds = slashQuery !== null
    ? SLASH_COMMANDS.filter(c => c.id.includes(slashQuery))
    : [];

  const filteredDocs = mentionQuery !== null
    ? documents.filter(d => d.title.toLowerCase().includes(mentionQuery))
    : [];

  /* ── Effects ── */

  const loadConversations = useCallback(() => {
    if (!studySetId) { setConversations([]); return; }
    gatewayGet<Conversation[]>(`/coach/conversations?studySetId=${encodeURIComponent(studySetId)}`)
      .then(setConversations)
      .catch(() => setConversations([]));
  }, [studySetId]);

  useEffect(() => { loadConversations(); }, [loadConversations, sidebarRefreshKey]);

  useEffect(() => {
    if (!studySetId) return;
    getDocuments(studySetId).then(setDocuments).catch(() => {});
  }, [studySetId]);

  // Mark chips as deleted when their document no longer exists
  useEffect(() => {
    if (!studySetId) return;
    const docIds = new Set(documents.map(d => d._id));
    setChips(prev =>
      prev.length === 0 ? prev : prev.map(c => ({ ...c, deleted: !docIds.has(c.id) })),
    );
  }, [documents, studySetId]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'h') {
        e.preventDefault();
        setHistoryOpen(v => !v);
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'N') {
        e.preventDefault();
        handleNewConversation();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // "Ask Smart Coach" from the universal selection menu pushes text here.
  // Append to whatever's already in the box so users can chain selections.
  useEffect(() => {
    if (!pendingCoachInput) return;
    const incoming = pendingCoachInput.text;
    setInput(prev => {
      const joiner = prev.trim() ? '\n\n' : '';
      return prev + joiner + incoming;
    });
    clearPendingCoachInput();
    // Focus the textarea and move caret to the end.
    setTimeout(() => {
      const el = textareaRef.current;
      if (el) {
        el.focus();
        const len = el.value.length;
        el.setSelectionRange(len, len);
        el.style.height = 'auto';
        el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
      }
    }, 0);
  }, [pendingCoachInput, clearPendingCoachInput]);

  /* ── Handlers ── */

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInput(val);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;

    // Deselect chips when typing
    if (selectedChipIdx !== null) setSelectedChipIdx(null);

    // Detect @-mention
    const cursorPos   = e.target.selectionStart ?? val.length;
    const textBefore  = val.slice(0, cursorPos);
    const mentionMatch = textBefore.match(/@([^\s@]*)$/);
    if (mentionMatch) {
      mentionStartRef.current = cursorPos - mentionMatch[0].length;
      setMentionQuery(mentionMatch[1].toLowerCase());
      setSlashQuery(null);
      setSlashHighlight(0);
      return;
    }
    setMentionQuery(null);

    // Detect slash command (/ as first char, no space yet)
    if (val.startsWith('/') && !val.includes(' ')) {
      setSlashQuery(val.slice(1).toLowerCase());
    } else {
      setSlashQuery(null);
      setSlashHighlight(0);
    }
  };

  const handleMentionSelect = (doc: SynapseDocument) => {
    const cursorPos = textareaRef.current?.selectionStart ?? input.length;
    const newInput  = input.slice(0, mentionStartRef.current) + input.slice(cursorPos);
    setInput(newInput);
    setChips(prev => [...prev, { id: doc._id, name: doc.title }]);
    setMentionQuery(null);
    setSelectedChipIdx(null);
    setTimeout(() => textareaRef.current?.focus(), 0);
  };

  const handleSlashSelect = (cmdId: string) => {
    setInput(`/${cmdId} `);
    setSlashQuery(null);
    setSlashHighlight(0);
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        const len = textareaRef.current.value.length;
        textareaRef.current.setSelectionRange(len, len);
      }
    }, 0);
  };

  const removeChip = (idx: number) => {
    setChips(prev => prev.filter((_, i) => i !== idx));
    if (selectedChipIdx === idx) setSelectedChipIdx(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Slash command keyboard navigation
    if (slashQuery !== null && visibleSlashCmds.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSlashHighlight(h => (h + 1) % visibleSlashCmds.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSlashHighlight(h => (h - 1 + visibleSlashCmds.length) % visibleSlashCmds.length);
        return;
      }
      if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        const cmd = visibleSlashCmds[slashHighlight];
        if (cmd) handleSlashSelect(cmd.id);
        return;
      }
      if (e.key === 'Escape') {
        setSlashQuery(null);
        return;
      }
    }

    // Close @-mention with Escape
    if (e.key === 'Escape' && mentionQuery !== null) {
      setMentionQuery(null);
      return;
    }

    // Send
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void handleSend();
      return;
    }

    // Two-backspace chip removal
    if (e.key === 'Backspace') {
      if (input === '' && chips.length > 0) {
        e.preventDefault();
        if (selectedChipIdx === null) {
          setSelectedChipIdx(chips.length - 1);
        } else {
          setChips(prev => prev.filter((_, i) => i !== selectedChipIdx));
          setSelectedChipIdx(null);
        }
      } else if (selectedChipIdx !== null) {
        setSelectedChipIdx(null);
      }
    } else if (!['Shift', 'Meta', 'Control', 'Alt'].includes(e.key) && selectedChipIdx !== null) {
      setSelectedChipIdx(null);
    }
  };

  const handleSelectConversation = async (id: string) => {
    try {
      const convo = await gatewayGet<ConversationDetail>(`/coach/conversations/${id}`);
      setActiveConversationId(id);
      seed(convo.messages);
    } catch {
      toast.error('Failed to load conversation.');
    }
  };

  const handleNewConversation = () => {
    clear();
    setActiveConversationId(null);
    setChips([]);
  };

  const handleSend = async (text?: string) => {
    const raw = (text ?? input).trim();
    if (!raw || streaming) return;

    // Parse slash command
    let commandType: string | undefined;
    const slashMatch = raw.match(/^\/(\w+)(?:\s|$)/);
    if (slashMatch) {
      const cmd = slashMatch[1].toLowerCase();
      if (['quiz', 'plan', 'batch'].includes(cmd)) commandType = cmd;
    }

    setInput('');
    setMentionQuery(null);
    setSlashQuery(null);
    setSlashHighlight(0);
    setSelectedChipIdx(null);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    const baseOpts: SendOptions = {
      socratic,
      commandType,
      documentIds: chips.filter(c => !c.deleted).map(c => c.id),
    };

    let convId = activeConversationId;
    if (!convId) {
      try {
        const convo = await gatewayPost<{ _id: string }>('/coach/conversations', {
          studySetId,
          title: raw.slice(0, 60),
        });
        convId = convo._id;
        setActiveConversationId(convId);
        setSidebarRefreshKey(k => k + 1);
      } catch { /* Non-fatal */ }
    }

    const opts: SendOptions = { ...baseOpts, conversationId: convId ?? undefined };
    lastSendOptsRef.current = opts;
    send(raw, opts);
    textareaRef.current?.focus();
  };

  // Auto-send the leech-card coaching prompt once per cardId. We wait for an
  // empty conversation so we don't barge into a resumed thread.
  useEffect(() => {
    if (!cardContext || !initialMessage) return;
    if (autoSentForCardRef.current === cardContext._id) return;
    if (messages.length > 0 || streaming) return;
    autoSentForCardRef.current = cardContext._id;
    void handleSend(initialMessage);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardContext?._id, initialMessage, messages.length, streaming]);

  const handleRegenerate = useCallback(() => {
    if (streaming) return;
    void regenerate(lastSendOptsRef.current);
  }, [streaming, regenerate]);

  const handleDeleteConversation = (id: string) => {
    setConversations(prev => prev.filter(c => c._id !== id));
    if (activeConversationId === id) { setActiveConversationId(null); seed([]); }

    const tid = setTimeout(async () => {
      await gatewayDelete(`/coach/conversations/${id}`).catch(() => {});
      delete pendingDeleteRef.current[id];
    }, 4000);
    pendingDeleteRef.current[id] = tid;

    toast('Conversation deleted', {
      action: {
        label:   'Undo',
        onClick: () => {
          clearTimeout(pendingDeleteRef.current[id]);
          delete pendingDeleteRef.current[id];
          loadConversations();
        },
      },
    });
  };

  /* ── Render ── */

  return (
    <>
      {cardContext && (
        <FlashcardEditDialog
          open={editCardOpen}
          onClose={() => setEditCardOpen(false)}
          studySetId={cardContext.studySetId}
          card={{
            _id:        cardContext._id,
            userId:     '',
            studySetId: cardContext.studySetId,
            cardType:   cardContext.cardType,
            front:      cardContext.front,
            back:       cardContext.back,
            clozeBody:  cardContext.clozeBody,
            tags:       cardContext.tags,
          } as Flashcard}
          onSaved={() => setEditCardOpen(false)}
        />
      )}

      <ConversationHistoryPopup
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        conversations={conversations}
        activeConversationId={activeConversationId}
        onSelectConversation={handleSelectConversation}
        onNewConversation={handleNewConversation}
        onDeleteConversation={handleDeleteConversation}
      />

      <div className="flex h-full overflow-hidden">
        {fullPage && studySetId && (
          <ConversationsSidebar
            studySetId={studySetId}
            activeConversationId={activeConversationId}
            onSelectConversation={handleSelectConversation}
            onNewConversation={handleNewConversation}
            onDeleteConversation={(id) => handleDeleteConversation(id)}
            refreshKey={sidebarRefreshKey}
          />
        )}

        <div className="flex flex-col flex-1 min-w-0 h-full">
          {/* Header */}
          <div className="shrink-0 border-b border-border px-panel-x py-2 flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 gap-1.5 text-xs shrink-0"
              onClick={() => setHistoryOpen(true)}
              aria-label="Open conversation history"
              title={`History (${mod}H)`}
            >
              <History className="h-3.5 w-3.5" />
              History
            </Button>

            <p className="text-xs font-medium text-foreground-muted truncate flex-1 pl-1">
              {studySetName
                ? t('sidePanel.coachHeader', { studySet: studySetName })
                : 'Smart Coach'}
            </p>

            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0"
              onClick={handleNewConversation}
              aria-label="New conversation"
              title={`New conversation (${mod}⇧N)`}
            >
              <SquarePen className="h-3.5 w-3.5" />
            </Button>

            {!fullPage && studySetId && (
              <Link
                href={`/sets/${studySetId}/coach`}
                className="shrink-0 flex items-center rounded p-1 hover:bg-surface-2 text-foreground-subtle hover:text-foreground transition-colors"
                aria-label="Open in full page"
                title="Open in full page"
              >
                <Maximize2 className="h-3.5 w-3.5" />
              </Link>
            )}
          </div>

          {/* Leech-card help banner */}
          {cardContext && (
            <div className="shrink-0 border-b border-border bg-warning-soft/40 px-panel-x py-3">
              <div className="flex items-start gap-3">
                <span className="shrink-0 mt-0.5 rounded px-1.5 py-0.5 text-[10px] font-mono font-medium bg-warning-soft text-warning">
                  Leech
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground-muted mb-1">
                    Coaching you on this card
                    {typeof cardContext.againCount === 'number' && cardContext.againCount > 0 && (
                      <span className="ml-2 font-mono text-danger">Again × {cardContext.againCount}</span>
                    )}
                  </p>
                  <p className="text-sm text-foreground line-clamp-2">
                    <span className="text-foreground-muted">Front:</span> {cardContext.front}
                  </p>
                  {cardContext.cardType !== 'cloze' && (
                    <p className="text-sm text-foreground-muted line-clamp-2">
                      <span>Back:</span> {cardContext.back}
                    </p>
                  )}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0 text-xs h-7"
                  onClick={() => setEditCardOpen(true)}
                >
                  Rewrite this card
                </Button>
              </div>
            </div>
          )}

          {/* Message list */}
          <div
            className="flex-1 overflow-y-auto px-panel-x py-4 flex flex-col gap-4"
            role="log"
            aria-live="polite"
            aria-label="Smart Coach conversation"
          >
            {messages.length === 0 && (
              <EmptyState
                icon={<MessageCircle className="h-6 w-6" aria-hidden="true" />}
                headline="Ask anything about your Study Set."
                subline="Try '@Chapter 4 explain limits'"
                action={
                  <div className="flex flex-wrap justify-center gap-2 max-w-[220px]">
                    {EXAMPLE_CHIPS.map(chip => (
                      <button
                        key={chip}
                        onClick={() => void handleSend(chip)}
                        className="text-xs rounded-full border border-border px-3 py-1.5 text-foreground-muted hover:text-foreground hover:bg-surface-2 transition-colors cursor-pointer"
                      >
                        {chip}
                      </button>
                    ))}
                  </div>
                }
              />
            )}

            {messages.map((msg, i) => (
              <MessageBubble
                key={i}
                role={msg.role}
                content={msg.content}
                citations={msg.citations}
                isStreaming={streaming && i === messages.length - 1 && msg.role === 'assistant'}
                isPlanResponse={msg.isPlanResponse}
                noRetrieval={msg.noRetrieval}
                socratic={msg.socratic}
                stages={msg.stages}
                studySetId={studySetId}
                onRegenerate={msg.role === 'assistant' && i === messages.length - 1 ? handleRegenerate : undefined}
              />
            ))}

            {error && (
              <div
                role="alert"
                className="flex items-center gap-2 rounded-md bg-danger-soft px-3 py-2 text-xs text-danger"
              >
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {error}
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Input area */}
          <div className="shrink-0 border-t border-border p-3 space-y-2">
            <div className="relative flex flex-col rounded-lg border border-border bg-surface-2 focus-within:ring-2 focus-within:ring-focus-ring">

              {/* Slash command popover */}
              {slashQuery !== null && visibleSlashCmds.length > 0 && (
                <div
                  className="absolute bottom-full left-0 mb-1 min-w-[160px] rounded-lg border border-border bg-background shadow-md z-50 overflow-hidden"
                  role="listbox"
                  aria-label="Slash commands"
                >
                  {visibleSlashCmds.map((cmd, i) => (
                    <button
                      key={cmd.id}
                      role="option"
                      aria-selected={i === slashHighlight}
                      onClick={() => handleSlashSelect(cmd.id)}
                      className={cn(
                        'w-full text-left px-3 py-2 flex items-baseline gap-2 transition-colors',
                        i === slashHighlight ? 'bg-surface-2' : 'hover:bg-surface-2',
                      )}
                    >
                      <span className="font-mono text-[11px] text-primary shrink-0">/{cmd.id}</span>
                      <span className="text-[11px] text-foreground-muted truncate">{cmd.label}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* @-mention popover */}
              {mentionQuery !== null && (
                <div
                  className="absolute bottom-full left-0 mb-1 w-56 rounded-lg border border-border bg-background shadow-md z-50 overflow-hidden max-h-44 overflow-y-auto"
                  role="listbox"
                  aria-label="Document references"
                >
                  {filteredDocs.length > 0 ? filteredDocs.map(doc => (
                    <button
                      key={doc._id}
                      role="option"
                      onClick={() => handleMentionSelect(doc)}
                      className="w-full text-left px-3 py-1.5 flex items-center gap-2 text-[11px] text-foreground hover:bg-surface-2 transition-colors"
                    >
                      <FileText className="h-3.5 w-3.5 shrink-0 text-foreground-muted" />
                      <span className="truncate">{doc.title}</span>
                    </button>
                  )) : (
                    <div className="px-3 py-2.5 text-[11px] text-foreground-subtle">
                      {documents.length === 0
                        ? 'No documents yet — upload a PDF first.'
                        : 'No documents match.'}
                    </div>
                  )}
                </div>
              )}

              {/* Chips strip */}
              {chips.length > 0 && (
                <div className="flex flex-wrap gap-1 px-2 pt-2 pb-0.5">
                  {chips.map((chip, i) => (
                    <TooltipProvider key={chip.id}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span
                            className={cn(
                              'inline-flex items-center gap-1 rounded-full text-[11px] px-2 py-0.5 border transition-colors',
                              chip.deleted
                                ? 'bg-danger-soft text-danger border-danger/20 line-through'
                                : selectedChipIdx === i
                                ? 'bg-primary/15 border-primary/40 text-primary'
                                : 'bg-surface-3 border-transparent text-foreground-muted',
                            )}
                            aria-label={`Reference: ${chip.name}. Press Backspace twice to remove.`}
                          >
                            <FileText className="h-3 w-3 shrink-0" />
                            <span>{chip.name}</span>
                            <button
                              onClick={() => removeChip(i)}
                              aria-label={`Remove reference to ${chip.name}`}
                              className="ml-0.5 rounded-full hover:text-foreground"
                            >
                              <X className="h-2.5 w-2.5" />
                            </button>
                          </span>
                        </TooltipTrigger>
                        {chip.deleted && (
                          <TooltipContent side="top" className="text-[11px]">
                            This document was deleted.
                          </TooltipContent>
                        )}
                      </Tooltip>
                    </TooltipProvider>
                  ))}
                </div>
              )}

              {aiUnavailable && (
                <div className="px-3 py-2 text-xs text-[hsl(var(--warning))] bg-[hsl(var(--warning-soft))] rounded-t-md">
                  Smart Coach is unavailable. History is still readable.
                </div>
              )}
              <div className="relative">
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  placeholder={aiUnavailable ? 'Smart Coach is unavailable.' : 'Ask anything… or type @ to reference a document'}
                  rows={1}
                  disabled={aiUnavailable}
                  className="w-full resize-none bg-transparent text-sm text-foreground placeholder:text-foreground-subtle outline-none px-3 pt-2.5 pb-1 max-h-[120px] disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label="Message Smart Coach"
                  aria-keyshortcuts={`${mod}+Return`}
                />
                {showAtHint && (
                  <FirstTimeHint
                    hintId="hint:at-mention"
                    content="Type @ to reference a specific document"
                    position="top"
                  />
                )}
              </div>

              <div className="flex items-center justify-between px-2 pb-2">
                {/* Socratic toggle */}
                <button
                  onClick={() => setSocratic(v => !v)}
                  className={cn(
                    'text-xs rounded-full px-2.5 py-1 border transition-colors cursor-pointer',
                    socratic
                      ? 'bg-primary/12 border-primary/30 text-primary font-medium'
                      : 'border-border text-foreground-subtle hover:text-foreground',
                  )}
                  aria-pressed={socratic}
                  title="Toggle Socratic mode — coach asks questions instead of explaining"
                >
                  Socratic
                </button>

                {/* Send / Stop */}
                <Button
                  size="icon"
                  className={cn(
                    'h-7 w-7 shrink-0 transition-colors',
                    streaming && 'bg-foreground text-background hover:bg-foreground/90',
                  )}
                  onClick={streaming ? stop : () => void handleSend()}
                  disabled={aiUnavailable || (!streaming && !input.trim() && chips.length === 0)}
                  aria-label={streaming ? 'Stop generating' : 'Send message'}
                >
                  {streaming
                    ? <Square className="h-3.5 w-3.5 fill-current" />
                    : <Send className="h-3.5 w-3.5" />
                  }
                </Button>
              </div>
            </div>

            {/* Shortcut hints */}
            <div className="flex items-center justify-center gap-3 text-[10px] text-foreground-subtle flex-wrap">
              <span><kbd className="font-mono">{mod}↵</kbd> send</span>
              <span>·</span>
              <span><kbd className="font-mono">@</kbd> reference doc</span>
              <span>·</span>
              <span><kbd className="font-mono">/</kbd> commands</span>
              <span>·</span>
              <span><kbd className="font-mono">{mod}H</kbd> history</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
