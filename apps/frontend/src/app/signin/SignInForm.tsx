'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { Mail, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';

const IS_DEV = process.env.NEXT_PUBLIC_ENABLE_DEV_LOGIN === 'true';

type State = 'idle' | 'sent' | 'rate-limited';

export function SignInForm() {
  const { t } = useTranslation();
  const router = useRouter();

  const [state, setState]     = useState<State>('idle');
  const [email, setEmail]     = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError]     = useState('');
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const sendLink = async (targetEmail: string) => {
    setIsLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: targetEmail }),
      });
      if (res.status === 429) {
        setState('rate-limited');
        return;
      }
      setState('sent');
      setCooldown(60);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.includes('@')) {
      setError('Enter a valid email address');
      return;
    }
    await sendLink(email);
  };

  const handleDevLogin = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/dev-login', { method: 'POST' });
      if (res.ok) router.push('/');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    if (cooldown > 0) return;
    await sendLink(email);
  };

  return (
    <div className="w-full max-w-sm rounded-lg border border-border bg-background p-8 shadow-md">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 h-10 w-10 rounded-lg bg-primary flex items-center justify-center">
          <span className="text-lg font-medium text-primary-fg" aria-hidden="true">S</span>
        </div>
        <h1 className="text-h1 text-foreground">
          {state === 'sent' ? 'Check your inbox' : t('auth.signIn')}
        </h1>
        {state === 'idle' && (
          <p className="mt-1 text-sm text-foreground-muted">No password needed</p>
        )}
      </div>

      {state === 'sent' && (
        <div className="space-y-4 text-center">
          <div className="w-12 h-12 mx-auto rounded-full bg-success-soft flex items-center justify-center">
            <Mail size={20} className="text-success" aria-hidden="true" />
          </div>
          <p className="text-sm text-foreground-muted">
            We sent a link to{' '}
            <span className="font-medium text-foreground">{email}</span>.
            It expires in 10 minutes.
          </p>
          <button
            onClick={handleResend}
            disabled={cooldown > 0}
            className="text-sm text-primary hover:underline disabled:text-foreground-disabled disabled:no-underline"
          >
            {cooldown > 0
              ? <>Resend in <span className="font-mono">{cooldown}s</span></>
              : 'Resend link'
            }
          </button>
          <button
            onClick={() => setState('idle')}
            className="block mx-auto text-xs text-foreground-muted hover:text-foreground"
          >
            Use a different email
          </button>
        </div>
      )}

      {state === 'rate-limited' && (
        <div className="space-y-3 text-center">
          <p className="text-sm text-danger">Too many requests. Try again in a few minutes.</p>
          <button
            onClick={() => setState('idle')}
            className="text-sm text-primary hover:underline"
          >
            Try again
          </button>
        </div>
      )}

      {state === 'idle' && (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          {error && (
            <div
              role="alert"
              className="flex items-center gap-2 rounded-md bg-danger-soft px-3 py-2 text-sm text-danger"
            >
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
              {error}
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="text-sm font-medium text-foreground">
              {t('auth.emailLabel')}
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              autoFocus
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@university.edu"
              className={cn(
                'rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground',
                'placeholder:text-foreground-subtle',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
              )}
            />
          </div>
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? 'Sending…' : 'Continue →'}
          </Button>

          {IS_DEV && (
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-background px-2 text-foreground-muted">dev only</span>
              </div>
            </div>
          )}
          {IS_DEV && (
            <Button
              type="button"
              variant="outline"
              className="w-full font-mono text-xs text-foreground-muted"
              disabled={isLoading}
              onClick={handleDevLogin}
            >
              Dev Login (skip email)
            </Button>
          )}
        </form>
      )}
    </div>
  );
}
