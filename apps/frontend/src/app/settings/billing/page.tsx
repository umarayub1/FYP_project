import { BillingSettings } from '@/components/settings/BillingSettings';
import { gatewayGet } from '@/lib/api/gateway';

export const metadata = { title: 'Billing — Settings — Synapse' };

interface QuotaResponse {
  pdfsIngested:    number;
  tokensUsed:      number;
  feynmanSessions: number;
  tier?:           'free' | 'pro';
  limits?:         { pdfsIngested: number; tokensUsed: number; feynmanSessions: number };
}

const FALLBACK: QuotaResponse = {
  pdfsIngested:    0,
  tokensUsed:      0,
  feynmanSessions: 0,
  tier:            'free',
};

export default async function BillingSettingsPage() {
  const quota = await gatewayGet<QuotaResponse>('/quota').catch(() => FALLBACK);
  return <BillingSettings quota={quota} />;
}
