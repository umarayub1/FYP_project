'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';

const TABS = [
  { label: 'Profile',     href: '/settings/profile'     },
  { label: 'Preferences', href: '/settings/preferences' },
  { label: 'API Keys',    href: '/settings/api-keys'    },
  { label: 'Billing',     href: '/settings/billing'     },
];

export function SettingsNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Settings tabs" className="flex gap-1 border-b border-border mb-section-y">
      {TABS.map(tab => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'px-4 py-2 text-sm font-medium border-b-2 transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring rounded-t-md',
              active
                ? 'text-foreground border-primary'
                : 'text-foreground-muted border-transparent hover:text-foreground hover:border-border'
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
