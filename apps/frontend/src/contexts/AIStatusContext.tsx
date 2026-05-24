'use client';

import { createContext, useContext, useState, useCallback, useRef, useEffect, type ReactNode } from 'react';
import { toast } from 'sonner';

export type AIStatus = 'available' | 'unavailable' | 'unknown';
export type AIUnavailableReason = 'quota_exhausted' | 'invalid_key' | 'ollama_offline' | 'network_error' | null;

interface AIStatusContextValue {
  status: AIStatus;
  reason: AIUnavailableReason;
  setUnavailable: (reason: AIUnavailableReason) => void;
  setAvailable: () => void;
}

const AIStatusContext = createContext<AIStatusContextValue | null>(null);

const SESSION_KEY = 'synapse:ai-status';

export function AIStatusProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AIStatus>('unknown');
  const [reason, setReason] = useState<AIUnavailableReason>(null);
  const statusRef = useRef<AIStatus>('unknown');

  useEffect(() => {
    const stored = sessionStorage.getItem(SESSION_KEY);
    if (stored === 'unavailable') {
      statusRef.current = 'unavailable';
      setStatus('unavailable');
    } else if (stored === 'available') {
      statusRef.current = 'available';
      setStatus('available');
    }
  }, []);

  const setUnavailable = useCallback((r: AIUnavailableReason) => {
    statusRef.current = 'unavailable';
    setStatus('unavailable');
    setReason(r);
    sessionStorage.setItem(SESSION_KEY, 'unavailable');
  }, []);

  const setAvailable = useCallback(() => {
    if (statusRef.current === 'unavailable') {
      toast.success('AI features restored.');
    }
    statusRef.current = 'available';
    setStatus('available');
    setReason(null);
    sessionStorage.setItem(SESSION_KEY, 'available');
  }, []);

  return (
    <AIStatusContext.Provider value={{ status, reason, setUnavailable, setAvailable }}>
      {children}
    </AIStatusContext.Provider>
  );
}

export function useAIStatus(): AIStatusContextValue {
  const ctx = useContext(AIStatusContext);
  if (!ctx) throw new Error('useAIStatus must be used within AIStatusProvider');
  return ctx;
}

export function detectAIErrorReason(httpStatus?: number): AIUnavailableReason {
  if (httpStatus === 402) return 'quota_exhausted';
  if (httpStatus === 401) return 'invalid_key';
  if (httpStatus === 503) return 'ollama_offline';
  return 'network_error';
}
