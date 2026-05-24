import Link from 'next/link';
import { ArrowLeft, Sparkles, Check } from 'lucide-react';

export const metadata = { title: 'Upgrade — Billing — Synapse' };

const PRO_INCLUDES = [
  'Unlimited PDFs and notes per study set',
  'Higher monthly token budget for Smart Coach and Feynman grading',
  'Priority embedding + ingestion queue',
  'Advanced analytics (mastery decay, retention curves)',
  'Faster models for grading and chat',
];

export default function UpgradePlaceholderPage() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-start gap-5 py-12">
      <Link
        href="/settings/billing"
        className="inline-flex items-center gap-1.5 text-xs text-foreground-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring rounded"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
        Back to billing
      </Link>

      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
        <Sparkles className="h-5 w-5 text-primary" aria-hidden="true" />
      </div>

      <div>
        <h1 className="text-h1 text-foreground">Upgrade to Pro</h1>
        <p className="mt-2 text-sm text-foreground-muted">
          Paid plans aren&apos;t live yet. Here&apos;s what Pro is planned to include.
          You&apos;re on Free in the meantime — quotas reset monthly.
        </p>
      </div>

      <ul className="flex w-full flex-col gap-2.5 rounded-lg border border-border bg-surface p-4">
        {PRO_INCLUDES.map(item => (
          <li key={item} className="flex items-start gap-2 text-sm text-foreground">
            <Check className="h-4 w-4 shrink-0 text-primary mt-0.5" aria-hidden="true" />
            <span>{item}</span>
          </li>
        ))}
      </ul>

      <p className="text-xs text-foreground-subtle">
        We&apos;ll email you when Pro opens. Until then, every Free feature stays free.
      </p>
    </div>
  );
}
