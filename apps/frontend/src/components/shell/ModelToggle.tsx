'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Cpu, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/cn';

type Provider = 'external' | 'anthropic' | 'local';

interface ModelOption {
  provider: Provider;
  model:    string;
  short:    string;
  label:    string;
  hint:     string;
}

const OPTIONS: ModelOption[] = [
  {
    provider: 'external',
    model:    'gpt-4o-mini',
    short:    '4o-mini',
    label:    'GPT-4o mini',
    hint:     'Cheapest · $0.15 / $0.60 per M tok',
  },
  {
    provider: 'external',
    model:    'gpt-4.1-mini',
    short:    '4.1-mini',
    label:    'GPT-4.1 mini',
    hint:     'Balanced · $0.40 / $1.60',
  },
  {
    provider: 'external',
    model:    'o3-mini',
    short:    'o3-mini',
    label:    'o3-mini (reasoning)',
    hint:     'Pricier · $1.10 / $4.40 + thinking tokens',
  },
  {
    provider: 'anthropic',
    model:    'claude-haiku-4-5-20251001',
    short:    'Haiku 4.5',
    label:    'Claude Haiku 4.5',
    hint:     'Needs Anthropic API key',
  },
];

function findOption(provider: string | undefined, model: string | undefined): ModelOption {
  const match = OPTIONS.find(o => o.provider === provider && o.model === model);
  return match ?? OPTIONS[0];
}

export function ModelToggle() {
  const [loading, setLoading]   = useState(true);
  const [current, setCurrent]   = useState<ModelOption>(OPTIONS[0]);
  const [open, setOpen]         = useState(false);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/user/preferences')
      .then(r => r.ok ? r.json() : null)
      .then((prefs: { llmProvider?: string; llmModel?: string } | null) => {
        if (cancelled || !prefs) return;
        setCurrent(findOption(prefs.llmProvider, prefs.llmModel));
      })
      .catch(() => { /* leave default */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  async function selectOption(option: ModelOption) {
    if (option === current) { setOpen(false); return; }
    const previous = current;
    setCurrent(option);
    setUpdating(true);
    setOpen(false);
    try {
      const res = await fetch('/api/user/preferences', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ llmProvider: option.provider, llmModel: option.model }),
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      toast.success(`Switched to ${option.label}`, {
        description: option.provider === 'anthropic'
          ? 'Make sure your Anthropic API key is set in Settings → API Keys.'
          : option.hint,
      });
    } catch (err) {
      setCurrent(previous);
      toast.error('Could not switch model', { description: (err as Error).message });
    } finally {
      setUpdating(false);
    }
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 px-2 font-mono text-xs"
          aria-label={`AI model — ${current.label}`}
          disabled={loading}
        >
          <Cpu className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="hidden sm:inline">{loading ? '…' : current.short}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[260px]">
        <DropdownMenuLabel className="text-xs text-foreground-muted">
          AI model
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {OPTIONS.map(opt => {
          const active = opt.provider === current.provider && opt.model === current.model;
          return (
            <DropdownMenuItem
              key={`${opt.provider}:${opt.model}`}
              onClick={() => selectOption(opt)}
              className={cn('flex flex-col items-start gap-0.5 py-2', active && 'bg-primary-soft text-primary')}
              disabled={updating}
            >
              <div className="flex w-full items-center justify-between gap-2">
                <span className="text-sm font-medium">{opt.label}</span>
                {active && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
              </div>
              <span className="text-[11px] text-foreground-muted">{opt.hint}</span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
