'use client';

import { useState, useCallback, useRef } from 'react';
import { useAIStatus, detectAIErrorReason } from '@/contexts/AIStatusContext';

export interface Citation {
  n:           number;
  chunkId:     string;
  sourceType:  'pdf' | 'note';
  sourceId:    string;
  sourceTitle: string;
  snippet:     string;
  fullText?:   string;
  pageNumber?: number | null;
}

export interface ChatStage {
  stage: 'retrieving' | 'ranking' | 'synthesizing';
  label: string;
}

export interface ChatMessage {
  role:            'user' | 'assistant';
  content:         string;
  commandType?:    string;
  isPlanResponse?: boolean;
  citations?:      Citation[];
  noRetrieval?:    boolean;
  socratic?:       boolean;
  stages?:         ChatStage[];   // ordered list of RAG stages, set as they arrive
}

export interface SendOptions {
  socratic?:        boolean;
  commandType?:     string;
  documentIds?:     string[];
  conversationId?:  string;
}

export function useSSEChat(studySetId?: string) {
  const [messages, setMessagesState] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming]    = useState(false);
  const [error, setError]            = useState<string | null>(null);
  const abortRef                     = useRef<AbortController | null>(null);
  const messagesRef                  = useRef<ChatMessage[]>([]);
  const { setUnavailable, setAvailable } = useAIStatus();

  const setMessages = useCallback(
    (updater: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => {
      setMessagesState(prev => {
        const next = typeof updater === 'function' ? updater(prev) : updater;
        messagesRef.current = next;
        return next;
      });
    },
    [],
  );

  const doStream = useCallback(async (
    text: string,
    history: Array<{ role: string; content: string }>,
    opts: SendOptions,
    isPlanResponse: boolean,
  ) => {
    setStreaming(true);
    setError(null);
    abortRef.current = new AbortController();

    let assistantContent = '';
    let citations: Citation[] | undefined;
    let noRetrieval = false;
    let socraticFlag = false;
    let stages: ChatStage[] = [];
    setMessages(prev => [...prev, { role: 'assistant', content: '', isPlanResponse, stages: [] }]);

    try {
      const res = await fetch('/api/ai/chat', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        signal:  abortRef.current.signal,
        body: JSON.stringify({
          message:        text,
          history,
          studySetId,
          socratic:       opts.socratic,
          commandType:    opts.commandType,
          documentIds:    opts.documentIds,
          conversationId: opts.conversationId,
        }),
      });

      if (!res.ok || !res.body) {
        setUnavailable(detectAIErrorReason(res.status));
        throw new Error(`Chat failed: ${res.status}`);
      }

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split('\n')) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6);
          if (raw === '[DONE]') continue;
          try {
            const parsed = JSON.parse(raw);
            if (parsed.done) continue;
            if (parsed.citations && Array.isArray(parsed.citations)) {
              citations = parsed.citations as Citation[];
              setMessages(prev => {
                const next = [...prev];
                const last = next[next.length - 1];
                if (last && last.role === 'assistant') {
                  next[next.length - 1] = { ...last, citations };
                }
                return next;
              });
              continue;
            }
            if (parsed.no_retrieval === true) {
              noRetrieval = true;
              setMessages(prev => {
                const next = [...prev];
                const last = next[next.length - 1];
                if (last && last.role === 'assistant') {
                  next[next.length - 1] = { ...last, noRetrieval: true };
                }
                return next;
              });
              continue;
            }
            if (parsed.mode === 'socratic') {
              socraticFlag = true;
              setMessages(prev => {
                const next = [...prev];
                const last = next[next.length - 1];
                if (last && last.role === 'assistant') {
                  next[next.length - 1] = { ...last, socratic: true };
                }
                return next;
              });
              continue;
            }
            if (typeof parsed.stage === 'string' && typeof parsed.label === 'string') {
              const next: ChatStage = {
                stage: parsed.stage as ChatStage['stage'],
                label: parsed.label,
              };
              // Replace existing entry for the same stage name; otherwise append.
              const idx = stages.findIndex(s => s.stage === next.stage);
              stages = idx >= 0
                ? stages.map((s, i) => (i === idx ? next : s))
                : [...stages, next];
              setMessages(prev => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last && last.role === 'assistant') {
                  updated[updated.length - 1] = { ...last, stages };
                }
                return updated;
              });
              continue;
            }
            assistantContent += parsed.token ?? '';
          } catch {
            assistantContent += raw;
          }
          setMessages(prev => {
            const next = [...prev];
            next[next.length - 1] = {
              role: 'assistant',
              content: assistantContent,
              isPlanResponse,
              citations,
              noRetrieval,
              socratic: socraticFlag,
              stages,
            };
            return next;
          });
        }
      }

      setAvailable();
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      if (!(err instanceof Error && err.message.startsWith('Chat failed:'))) {
        setUnavailable('network_error');
      }
      setError('SmartCoach is unavailable. Check your connection.');
      setMessages(prev => prev.slice(0, -1));
    } finally {
      setStreaming(false);
    }
  }, [studySetId, setMessages, setUnavailable, setAvailable]);

  const send = useCallback(async (text: string, opts: SendOptions = {}) => {
    if (!text.trim() || streaming) return;
    const history = messagesRef.current.map(m => ({ role: m.role, content: m.content }));
    const isPlanResponse = opts.commandType === 'plan';
    setMessages(prev => [...prev, { role: 'user', content: text, commandType: opts.commandType }]);
    await doStream(text, history, opts, isPlanResponse);
  }, [streaming, setMessages, doStream]);

  const regenerate = useCallback(async (opts: SendOptions = {}) => {
    if (streaming) return;
    const currentMsgs = messagesRef.current;
    let lastUserIdx = -1;
    for (let i = currentMsgs.length - 1; i >= 0; i--) {
      if (currentMsgs[i].role === 'user') { lastUserIdx = i; break; }
    }
    if (lastUserIdx < 0) return;

    const lastUserMsg    = currentMsgs[lastUserIdx];
    const historyForRegen = currentMsgs.slice(0, lastUserIdx).map(m => ({ role: m.role, content: m.content }));
    const baseMessages   = currentMsgs.slice(0, lastUserIdx + 1);
    const isPlanResponse = (opts.commandType ?? lastUserMsg.commandType) === 'plan';
    const mergedOpts     = { ...opts, commandType: opts.commandType ?? lastUserMsg.commandType };

    const trimmed: ChatMessage[] = baseMessages;
    messagesRef.current = trimmed;
    setMessagesState(trimmed);

    await doStream(lastUserMsg.content, historyForRegen, mergedOpts, isPlanResponse);
  }, [streaming, doStream]);

  const clear = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    setError(null);
    setStreaming(false);
  }, [setMessages]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    setStreaming(false);
  }, []);

  const seed = useCallback((msgs: ChatMessage[]) => {
    abortRef.current?.abort();
    setMessages(msgs);
    setError(null);
    setStreaming(false);
  }, [setMessages]);

  return { messages, streaming, error, send, regenerate, clear, seed, stop };
}
