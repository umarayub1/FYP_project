'use client';

import Link from 'next/link';
import { Zap, ArrowRight, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatNumber } from '@/lib/format/number';
import { cn } from '@/lib/cn';

const FREE_LIMITS = {
  tokensUsed:      200_000,
  pdfsIngested:    20,
  feynmanSessions: 10,
};

interface QuotaData {
  pdfsIngested:    number;
  tokensUsed:      number;
  feynmanSessions: number;
  tier?:           'free' | 'pro';
  limits?:         { pdfsIngested: number; tokensUsed: number; feynmanSessions: number };
}

interface QuotaBarProps {
  label: string;
  used:  number;
  limit: number;
  unit?: string;
}

function QuotaBar({ label, used, limit, unit = '' }: QuotaBarProps) {
  const unlimited = limit < 0;
  const pct  = unlimited ? 0 : limit > 0 ? Math.min((used / limit) * 100, 100) : 0;
  // UX_v3 §6.19: primary <60%, warning 60–89%, danger 90–100%
  const fill = unlimited
    ? 'bg-primary'
    : pct >= 90 ? 'bg-danger' : pct >= 60 ? 'bg-warning' : 'bg-primary';

  return (
    <div>
      <div className="flex justify-between text-xs font-mono mb-1.5">
        <span className="font-medium text-foreground">{label}</span>
        <span className="text-foreground-muted">
          {formatNumber(used)}{unit} / {unlimited ? 'Unlimited' : `${formatNumber(limit)}${unit}`}
        </span>
      </div>
      <div className="h-1 w-full rounded-full bg-surface-2 overflow-hidden">
        <div
          className={cn('h-full rounded-full', fill)}
          style={{ width: unlimited ? '100%' : `${pct}%` }}
          role="progressbar"
          aria-valuenow={used}
          aria-valuemin={0}
          aria-valuemax={Math.max(limit, 0)}
          aria-label={unlimited ? `${label}: unlimited` : `${label}: ${Math.round(pct)}% used`}
        />
      </div>
    </div>
  );
}

interface Invoice {
  id:     string;
  date:   string;
  amount: number;
  status: 'paid' | 'open' | 'void';
  pdfUrl: string;
}

function InvoiceStatusBadge({ status }: { status: Invoice['status'] }) {
  const styles: Record<Invoice['status'], string> = {
    paid: 'bg-[hsl(var(--success-soft))] text-[hsl(var(--success))]',
    open: 'bg-[hsl(var(--warning-soft))] text-[hsl(var(--warning))]',
    void: 'bg-surface-2 text-foreground-muted',
  };
  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', styles[status])}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

interface BillingSettingsProps {
  quota:    QuotaData;
  invoices?: Invoice[];
}

export function BillingSettings({ quota, invoices = [] }: BillingSettingsProps) {
  const tier   = quota.tier   ?? 'free';
  const isPro  = tier === 'pro';
  // Server is the source of truth for limits; fall back to local FREE_LIMITS
  // only when the API didn't include the field (older builds).
  const limits = {
    pdfsIngested:    quota.limits?.pdfsIngested    ?? FREE_LIMITS.pdfsIngested,
    tokensUsed:      quota.limits?.tokensUsed      ?? FREE_LIMITS.tokensUsed,
    feynmanSessions: quota.limits?.feynmanSessions ?? FREE_LIMITS.feynmanSessions,
  };
  const usages = [
    { label: 'PDFs ingested',    used: quota.pdfsIngested,    limit: limits.pdfsIngested },
    { label: 'AI tokens',        used: quota.tokensUsed,      limit: limits.tokensUsed },
    { label: 'Feynman sessions', used: quota.feynmanSessions, limit: limits.feynmanSessions },
  ];
  // Don't show "approaching limit" on unlimited tiers.
  const overLimit = !isPro && usages.some(u => u.limit > 0 && (u.used / u.limit) * 100 >= 90);

  return (
    <div className="space-y-8">
      {/* Plan card */}
      <section aria-labelledby="plan-heading">
        <h2 id="plan-heading" className="font-mono text-xs font-medium uppercase tracking-widest text-foreground-subtle mb-4">Current plan</h2>
        <div className="rounded-lg border border-border bg-background px-5 py-5">
          <div className="flex items-start justify-between gap-4 mb-5">
            <div className="flex items-center gap-3">
              <div className={cn(
                'flex h-10 w-10 items-center justify-center rounded-full',
                isPro ? 'bg-primary-soft' : 'bg-surface-3',
              )}>
                <Zap className={cn('h-5 w-5', isPro ? 'text-primary' : 'text-foreground-subtle')} aria-hidden="true" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-base font-medium text-foreground">{isPro ? 'Pro' : 'Free'}</p>
                  {isPro && (
                    <span className="inline-flex items-center rounded-full bg-primary-soft px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-primary">
                      Active
                    </span>
                  )}
                </div>
                <p className="text-xs text-foreground-muted">
                  {isPro ? 'All limits removed' : 'Resets monthly'}
                </p>
              </div>
            </div>
            {!isPro && (
              <Button className="gap-2 shrink-0" asChild>
                <Link href="/settings/billing/upgrade">
                  Upgrade
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              </Button>
            )}
          </div>

          <div className="space-y-4">
            {usages.map(u => (
              <QuotaBar key={u.label} label={u.label} used={u.used} limit={u.limit} />
            ))}
          </div>

          {overLimit && (
            <div
              className="mt-4 flex items-center gap-2 rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-xs font-medium text-danger"
              role="alert"
            >
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              Approaching plan limit — consider upgrading.
            </div>
          )}
        </div>

        {!isPro && (
          <p className="mt-3 text-xs text-foreground-muted">
            Pro gives you 2M tokens/mo, unlimited PDFs, and unlimited Feynman sessions.
          </p>
        )}
      </section>

      <hr className="border-border" />

      {/* Free vs Pro comparison */}
      <section aria-labelledby="compare-heading">
        <h2 id="compare-heading" className="font-mono text-xs font-medium uppercase tracking-widest text-foreground-subtle mb-4">Free vs Pro</h2>
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface border-b border-border">
                <th className="px-4 py-2 text-left text-xs font-medium text-foreground-muted uppercase tracking-wider">Feature</th>
                <th className="px-4 py-2 text-center text-xs font-medium text-foreground-muted uppercase tracking-wider">Free</th>
                <th className="px-4 py-2 text-center text-xs font-medium text-primary uppercase tracking-wider">Pro</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {[
                ['AI tokens / mo',       '200K',       '2M'],
                ['PDF uploads / mo',      '20',         'Unlimited'],
                ['Feynman sessions / mo', '10',         'Unlimited'],
                ['Priority support',      '—',          '✓'],
              ].map(([feature, free, pro]) => (
                <tr key={feature} className="bg-background">
                  <td className="px-4 py-2.5 text-foreground">{feature}</td>
                  <td className="px-4 py-2.5 text-center font-mono text-foreground-muted">{free}</td>
                  <td className="px-4 py-2.5 text-center font-mono text-primary font-medium">{pro}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <hr className="border-border" />

      {/* Invoices */}
      <section aria-labelledby="invoices-heading">
        <h2 id="invoices-heading" className="font-mono text-xs font-medium uppercase tracking-widest text-foreground-subtle mb-4">Invoices</h2>
        {invoices.length === 0 ? (
          <p className="text-sm text-foreground-muted">
            {isPro ? 'No invoices yet.' : 'No invoices yet — you’re on the free plan.'}
          </p>
        ) : (
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface border-b border-border">
                  <th className="px-4 py-2 text-left text-xs font-mono font-medium text-foreground-muted uppercase tracking-wider">Date</th>
                  <th className="px-4 py-2 text-right text-xs font-mono font-medium text-foreground-muted uppercase tracking-wider">Amount</th>
                  <th className="px-4 py-2 text-center text-xs font-mono font-medium text-foreground-muted uppercase tracking-wider">Status</th>
                  <th className="px-4 py-2 text-right text-xs font-mono font-medium text-foreground-muted uppercase tracking-wider">PDF</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {invoices.map(inv => (
                  <tr key={inv.id} className="bg-background">
                    <td className="px-4 py-2.5 font-mono text-foreground">
                      {new Date(inv.date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: '2-digit' })}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-foreground text-right">
                      ${(inv.amount / 100).toFixed(2)}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <InvoiceStatusBadge status={inv.status} />
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <a
                        href={inv.pdfUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary underline hover:no-underline"
                      >
                        Download
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
