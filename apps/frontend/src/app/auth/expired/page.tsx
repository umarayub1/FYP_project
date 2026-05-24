import Link from 'next/link';
import { Clock } from 'lucide-react';

export const metadata = { title: 'Link Expired — Synapse' };

export default function AuthExpiredPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-surface px-4">
      <div className="max-w-sm w-full text-center space-y-4">
        <div className="w-12 h-12 mx-auto rounded-full bg-warning-soft flex items-center justify-center">
          <Clock size={20} className="text-warning" aria-hidden="true" />
        </div>
        <h1 className="text-xl font-medium text-foreground">This link has expired</h1>
        <p className="text-sm text-foreground-muted">
          Magic links expire after 10 minutes. Request a new one to sign in.
        </p>
        <Link
          href="/signin"
          className="inline-flex items-center justify-center w-full px-4 py-2 rounded-md bg-primary text-primary-fg text-sm font-medium hover:bg-primary-hover transition-colors duration-75"
        >
          Request a new link
        </Link>
      </div>
    </div>
  );
}
