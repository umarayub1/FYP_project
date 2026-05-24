import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import CallbackInner from './CallbackInner';

export default function AuthCallbackPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Suspense
        fallback={
          <div className="text-center space-y-3">
            <Loader2 size={32} className="animate-spin mx-auto text-foreground-muted" aria-label="Verifying your link…" />
            <p className="text-sm text-foreground-muted">Signing you in…</p>
          </div>
        }
      >
        <CallbackInner />
      </Suspense>
    </div>
  );
}
