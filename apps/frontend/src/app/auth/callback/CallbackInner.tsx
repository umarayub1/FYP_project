'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useAuthStore } from '@/store/auth';

export default function CallbackInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const setUser = useAuthStore(s => s.setUser);

  useEffect(() => {
    const token = searchParams.get('token');
    if (!token) {
      router.replace('/auth/expired');
      return;
    }

    fetch(`/api/auth/callback?token=${encodeURIComponent(token)}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) {
          router.replace('/auth/expired');
          return;
        }
        if (data.user) setUser(data.user);
        const saved = sessionStorage.getItem('synapse:post-auth-redirect');
        if (saved) {
          sessionStorage.removeItem('synapse:post-auth-redirect');
          router.replace(saved);
        } else {
          router.replace(data.redirectTo ?? '/');
        }
      })
      .catch(() => router.replace('/auth/expired'));
  }, [router, searchParams, setUser]);

  return (
    <div className="text-center space-y-3">
      <Loader2 size={32} className="animate-spin mx-auto text-foreground-muted" aria-label="Verifying your link…" />
      <p className="text-sm text-foreground-muted">Signing you in…</p>
    </div>
  );
}
