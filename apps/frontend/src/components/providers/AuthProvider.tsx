'use client';

import { useEffect } from 'react';
import { useAuthStore } from '@/store/auth';

/** Bootstraps the auth session on first render by calling /api/auth/me. */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { setUser, setLoading } = useAuthStore();

  useEffect(() => {
    let cancelled = false;

    fetch('/api/auth/me')
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (!cancelled) {
          setUser(data?.user ?? null);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [setUser, setLoading]);

  return <>{children}</>;
}
