'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { SessionExpiredModal } from '@/components/auth/SessionExpiredModal';

const REDIRECT_KEY = 'synapse:post-auth-redirect';
const EVENT_NAME   = 'synapse:session-expired';

interface SessionExpiredCtx {
  trigger: () => void;
}

const Ctx = createContext<SessionExpiredCtx>({ trigger: () => {} });

export function SessionExpiredProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  const trigger = useCallback(() => {
    if (typeof window !== 'undefined' && !open) {
      sessionStorage.setItem(REDIRECT_KEY, window.location.href);
      setOpen(true);
    }
  }, [open]);

  useEffect(() => {
    const handler = () => trigger();
    window.addEventListener(EVENT_NAME, handler);
    return () => window.removeEventListener(EVENT_NAME, handler);
  }, [trigger]);

  return (
    <Ctx.Provider value={{ trigger }}>
      {children}
      <SessionExpiredModal open={open} onClose={() => setOpen(false)} />
    </Ctx.Provider>
  );
}

export const useSessionExpired = () => useContext(Ctx);

export { REDIRECT_KEY, EVENT_NAME };
