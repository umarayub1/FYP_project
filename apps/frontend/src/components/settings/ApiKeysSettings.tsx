'use client';

import { useState } from 'react';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';

interface Provider {
  id:          'openai' | 'anthropic';
  name:        string;
  placeholder: string;
  docsUrl:     string;
  prefix:      string;
  prefixError: string;
}

const PROVIDERS: Provider[] = [
  {
    id:          'openai',
    name:        'OpenAI',
    placeholder: 'sk-…',
    docsUrl:     'https://platform.openai.com/api-keys',
    prefix:      'sk-',
    prefixError: 'Key must start with sk-.',
  },
  {
    id:          'anthropic',
    name:        'Anthropic',
    placeholder: 'sk-ant-…',
    docsUrl:     'https://console.anthropic.com/settings/keys',
    prefix:      'sk-ant-',
    prefixError: 'Anthropic keys start with sk-ant-.',
  },
];

type ValidationState = 'idle' | 'validating' | 'valid' | 'invalid';

interface KeyRowState {
  key:          string;
  show:         boolean;
  editing:      boolean;
  validation:   ValidationState;
  lastValid?:   string;
  errorMessage: string;
}

function StatusBadge({ validation }: { validation: ValidationState }) {
  if (validation === 'valid') {
    return (
      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-[hsl(var(--success-soft))] text-[hsl(var(--success))]">
        Valid
      </span>
    );
  }
  if (validation === 'invalid') {
    return (
      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-[hsl(var(--danger-soft))] text-danger">
        Invalid
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-surface-2 text-foreground-muted">
      Unset
    </span>
  );
}

function KeyRow({ provider }: { provider: Provider }) {
  const [state, setState] = useState<KeyRowState>({
    key:          '',
    show:         false,
    editing:      false,
    validation:   'idle',
    errorMessage: '',
  });

  function toggle(field: Partial<KeyRowState>) {
    setState(s => ({ ...s, ...field }));
  }

  function describeError(code: string | undefined): string {
    switch (code) {
      case 'invalid_format':  return provider.prefixError;
      case 'quota_exceeded':  return 'This key has hit its usage limit.';
      case 'network':         return `Couldn't reach ${provider.name} — check your connection.`;
      case 'invalid_key':     return `${provider.name} rejected this key.`;
      default:                return `${provider.name} rejected this key.`;
    }
  }

  async function handleSave() {
    const trimmed = state.key.trim();
    if (!trimmed) return;

    // Client-side format guard — fail fast without a network round-trip.
    if (!trimmed.startsWith(provider.prefix)) {
      toggle({ validation: 'invalid', errorMessage: provider.prefixError });
      return;
    }

    toggle({ validation: 'validating', errorMessage: '' });

    // 1) Ping-test the key against the provider before persisting.
    let validateRes: Response;
    try {
      validateRes = await fetch(`/api/user/api-keys/${provider.id}/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: trimmed }),
      });
    } catch {
      toggle({ validation: 'invalid', errorMessage: describeError('network') });
      return;
    }

    if (!validateRes.ok) {
      const data = await validateRes.json().catch(() => ({})) as { code?: string };
      toggle({ validation: 'invalid', errorMessage: describeError(data?.code) });
      return;
    }

    // 2) Validated — persist.
    try {
      const res = await fetch('/api/user/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: provider.id, key: trimmed }),
      });
      if (res.ok || res.status === 204) {
        toggle({ validation: 'valid', editing: false, lastValid: new Date().toISOString(), errorMessage: '' });
      } else {
        toggle({ validation: 'invalid', errorMessage: describeError('invalid_key') });
      }
    } catch {
      toggle({ validation: 'invalid', errorMessage: describeError('network') });
    }
  }

  async function handleRemove() {
    await fetch(`/api/user/api-keys/${provider.id}`, { method: 'DELETE' }).catch(() => {});
    toggle({ key: '', validation: 'idle', lastValid: undefined, editing: false, errorMessage: '' });
  }

  const hasKey = state.validation === 'valid' || !!state.lastValid;

  return (
    <div className="rounded-lg border border-border bg-background">
      <div className="flex items-center justify-between px-4 py-3 gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-7 w-7 rounded-md bg-surface-3 flex items-center justify-center text-xs font-medium text-foreground-muted shrink-0" aria-hidden="true">
            {provider.name[0]}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">{provider.name}</p>
            {state.lastValid && !state.editing && (
              <p className="text-xs text-foreground-muted font-mono">
                Last validated {new Date(state.lastValid).toLocaleDateString()}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <StatusBadge validation={hasKey && state.validation !== 'invalid' ? 'valid' : state.validation} />
          {!state.editing && (
            <Button variant="outline" size="sm" onClick={() => toggle({ editing: true })}>
              {hasKey ? 'Edit' : 'Add key'}
            </Button>
          )}
          {hasKey && !state.editing && (
            <Button
              variant="outline"
              size="sm"
              className="text-danger border-danger/30 hover:bg-danger-soft"
              onClick={handleRemove}
              aria-label={`Remove ${provider.name} key`}
            >
              Remove
            </Button>
          )}
        </div>
      </div>

      {state.editing && (
        <div className="border-t border-border px-4 py-3 space-y-3">
          <div className="flex items-center gap-2">
            <div className="flex-1 flex items-center gap-2 rounded-md border border-border bg-surface-2 px-3 py-2">
              <input
                type={state.show ? 'text' : 'password'}
                value={state.key}
                onChange={e => toggle({ key: e.target.value, validation: 'idle', errorMessage: '' })}
                placeholder={provider.placeholder}
                className="flex-1 bg-transparent text-sm text-foreground placeholder:text-foreground-subtle font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--focus-ring))] focus-visible:ring-offset-2 rounded"
                aria-label={`${provider.name} API key`}
                autoComplete="off"
                autoFocus
              />
              <button
                type="button"
                onClick={() => toggle({ show: !state.show })}
                className="text-foreground-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring rounded cursor-pointer"
                aria-label={state.show ? 'Hide key' : 'Show key'}
              >
                {state.show
                  ? <EyeOff className="h-4 w-4" aria-hidden="true" />
                  : <Eye    className="h-4 w-4" aria-hidden="true" />
                }
              </button>
            </div>
          </div>

          {state.errorMessage && (
            <p className="text-xs font-medium text-danger" role="alert">{state.errorMessage}</p>
          )}

          <p className="text-xs text-foreground-subtle">
            Keys are stored encrypted server-side and never exposed to the browser after saving.{' '}
            <a href={provider.docsUrl} target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">
              Get a key ↗
            </a>
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={handleSave}
              disabled={!state.key.trim() || state.validation === 'validating'}
              className="gap-1.5"
            >
              {state.validation === 'validating' && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
              {state.validation === 'validating' ? 'Validating…' : 'Save & validate'}
            </Button>
            <Button variant="outline" size="sm" onClick={() => toggle({ editing: false, validation: 'idle', errorMessage: '' })}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function ApiKeysSettings() {
  const [usePlatformKeys, setUsePlatformKeys] = useState(true);

  return (
    <div className="space-y-8">
      {/* BYOK toggle */}
      <section aria-labelledby="byok-heading">
        <h2 id="byok-heading" className="font-mono text-xs font-medium uppercase tracking-widest text-foreground-subtle mb-1">Bring your own keys</h2>
        <p className="text-xs text-foreground-muted mb-4">
          Use your own API keys to avoid quota limits. Your keys are stored encrypted and never logged.
        </p>

        <div className="flex items-center justify-between rounded-lg border border-border bg-surface-1 px-4 py-3">
          <div>
            <p className="text-sm font-medium text-foreground">Use platform keys</p>
            <p className="text-xs text-foreground-muted">
              {usePlatformKeys
                ? 'Synapse\'s keys are active. You\'re consuming your monthly quota.'
                : 'Your own keys are active. No quota deducted.'}
            </p>
          </div>
          <button
            role="switch"
            aria-checked={usePlatformKeys}
            onClick={() => setUsePlatformKeys(v => !v)}
            className={cn(
              'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent',
              'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2',
              usePlatformKeys ? 'bg-primary' : 'bg-surface-3'
            )}
            aria-label="Use platform keys"
          >
            <span
              className={cn(
                'pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transition-transform',
                usePlatformKeys ? 'translate-x-4' : 'translate-x-0'
              )}
              aria-hidden="true"
            />
          </button>
        </div>
      </section>

      {/* Provider rows */}
      <section aria-labelledby="providers-heading">
        <h2 id="providers-heading" className="font-mono text-xs font-medium uppercase tracking-widest text-foreground-subtle mb-4">API keys by provider</h2>
        <div className="space-y-3">
          {PROVIDERS.map(p => <KeyRow key={p.id} provider={p} />)}
        </div>
      </section>
    </div>
  );
}
