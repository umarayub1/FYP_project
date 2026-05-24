import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';

const FEATURES = [
  {
    eyebrow: 'Chat with your PDFs',
    headline: 'Upload a PDF. Ask anything.',
    body: 'Synapse parses your documents and lets you query them conversationally. Every answer is grounded in your actual study material.',
    visualRight: true,
  },
  {
    eyebrow: 'Spaced repetition',
    headline: 'Never forget what you learned.',
    body: 'SM-2 scheduling surfaces each card exactly when you need it. Your review queue stays short; your retention stays high.',
    visualRight: false,
  },
  {
    eyebrow: 'Feynman technique',
    headline: 'Prove you understand it.',
    body: 'Explain a concept out loud. Synapse measures your clarity score and flags the gaps so you know exactly what to revisit.',
    visualRight: true,
  },
];

const PRICING_ROWS = [
  { label: 'Study Sets',   free: '3',      pro: 'Unlimited' },
  { label: 'PDFs',         free: '10',     pro: 'Unlimited' },
  { label: 'AI responses', free: '20/day', pro: 'Unlimited' },
  { label: 'BYOK',         free: '✗',      pro: '✓' },
  { label: 'Price',        free: 'Free',   pro: '$12/month' },
];

export function LandingPage() {
  return (
    <div className="min-h-screen bg-background">

      {/* ── Nav ── */}
      <nav className="sticky top-0 z-sticky h-10 flex items-center border-b border-border bg-background/95 backdrop-blur-sm">
        <div className="flex items-center w-full max-w-5xl mx-auto px-6 gap-6">
          <span className="text-[14px] font-medium text-primary select-none">Synapse</span>
          <div className="flex items-center gap-5 flex-1">
            <a
              href="#features"
              className="text-[13px] text-foreground-muted hover:text-foreground transition-colors duration-fast"
            >
              Features
            </a>
            <a
              href="#pricing"
              className="text-[13px] text-foreground-muted hover:text-foreground transition-colors duration-fast"
            >
              Pricing
            </a>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/signup"
              className="text-[13px] text-foreground-muted hover:text-foreground transition-colors duration-fast"
            >
              Sign in
            </Link>
            <Button asChild size="sm" className="rounded-sm h-7 px-3 text-xs">
              <Link href="/signup">Start free →</Link>
            </Button>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="flex flex-col items-center text-center pt-24 pb-20 px-6">
        <p className="text-[11px] uppercase tracking-[.08em] text-primary mb-4">
          Academic intelligence, built in
        </p>
        <h1 className="font-serif text-[40px] font-medium leading-[1.15] max-w-[480px] text-balance mb-5 text-foreground">
          Your PDFs don&apos;t have to stay PDFs.
        </h1>
        <p className="text-body-lg text-foreground-muted max-w-[440px] mb-8">
          Synapse turns your study materials into a personalised coach, flashcard engine, and
          knowledge map — built on the techniques that actually work.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button asChild size="lg">
            <Link href="/signup">Start for free →</Link>
          </Button>
          <Button
            asChild
            variant="ghost"
            size="lg"
            className="underline-offset-4 hover:underline hover:bg-transparent"
          >
            <a href="#features">See how it works →</a>
          </Button>
        </div>
      </section>

      {/* ── Features ── */}
      <section id="features" className="max-w-5xl mx-auto px-6 pb-24">
        <div className="space-y-20">
          {FEATURES.map((f) => (
            <div
              key={f.headline}
              className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center"
            >
              <div className={cn(f.visualRight ? 'md:order-1' : 'md:order-2')}>
                <p className="text-[10px] uppercase tracking-[.08em] text-primary mb-2">
                  {f.eyebrow}
                </p>
                <h2 className="text-[24px] font-medium leading-snug text-foreground mb-3">
                  {f.headline}
                </h2>
                <p className="text-body text-foreground-muted">{f.body}</p>
              </div>
              <div className={cn(f.visualRight ? 'md:order-2' : 'md:order-1')}>
                <div className="rounded-xl border border-border bg-surface p-6 h-48 flex items-center justify-center">
                  <span className="text-small text-foreground-subtle">Screenshot placeholder</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Pricing ── */}
      <section id="pricing" className="py-20 px-6 bg-surface">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-h1 text-foreground text-center mb-10">Simple pricing</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">

            {/* Free card */}
            <div className="rounded-lg border border-border bg-background p-6 flex flex-col">
              <div className="mb-5">
                <h3 className="text-[18px] font-medium text-foreground">Free</h3>
                <p className="text-small text-foreground-muted mt-0.5">Get started at no cost</p>
              </div>
              <div className="flex-1">
                {PRICING_ROWS.map((row) => (
                  <div
                    key={row.label}
                    className="flex justify-between items-center py-2.5 border-b border-border last:border-0"
                  >
                    <span className="text-body text-foreground-muted">{row.label}</span>
                    <span className="font-mono text-body text-foreground">{row.free}</span>
                  </div>
                ))}
              </div>
              <Button asChild variant="outline" size="lg" className="w-full mt-5">
                <Link href="/signup">Get started →</Link>
              </Button>
            </div>

            {/* Pro card */}
            <div className="rounded-lg border-2 border-primary/40 bg-background p-6 flex flex-col">
              <div className="mb-5">
                <h3 className="text-[18px] font-medium text-foreground">Pro</h3>
                <p className="text-small text-foreground-muted mt-0.5">For serious learners</p>
              </div>
              <div className="flex-1">
                {PRICING_ROWS.map((row) => (
                  <div
                    key={row.label}
                    className="flex justify-between items-center py-2.5 border-b border-border last:border-0"
                  >
                    <span className="text-body text-foreground-muted">{row.label}</span>
                    <span className="font-mono text-body text-foreground">{row.pro}</span>
                  </div>
                ))}
              </div>
              <Button asChild size="lg" className="w-full mt-5">
                <Link href="/signup">Get started →</Link>
              </Button>
            </div>

          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="py-8 px-6 text-center border-t border-border">
        <p className="text-[12px] text-foreground-subtle">
          © 2026 Synapse. Built for serious learners.
        </p>
      </footer>

    </div>
  );
}
