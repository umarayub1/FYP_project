import { Suspense } from 'react';
import { SignInForm } from './SignInForm';
import { Skeleton } from '@/components/ui/skeleton';

export const metadata = { title: 'Sign in — Synapse' };

export default function SignInPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-surface p-4">
      <Suspense fallback={<Skeleton className="h-80 w-full max-w-sm rounded-lg" />}>
        <SignInForm />
      </Suspense>
    </div>
  );
}
