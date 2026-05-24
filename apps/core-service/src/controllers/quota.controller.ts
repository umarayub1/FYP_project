import { Types } from 'mongoose';
import { UsageQuota, UsageQuotaDoc } from '../models/UsageQuota';
import { User } from '../models/User';

type QuotaType = 'pdfsIngested' | 'feynmanSessions' | 'tokensUsed';

const FREE_LIMITS: Record<QuotaType, number> = {
  pdfsIngested: parseInt(process.env.QUOTA_PDFS_FREE ?? '10', 10),
  feynmanSessions: parseInt(process.env.QUOTA_FEYNMAN_FREE ?? '20', 10),
  tokensUsed: parseInt(process.env.QUOTA_TOKENS_FREE ?? '200000', 10),
};

function currentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

async function getOrCreate(userId: string): Promise<UsageQuotaDoc> {
  const period = currentPeriod();
  let quota = await UsageQuota.findOne({ userId: new Types.ObjectId(userId), period });
  if (!quota) {
    quota = await UsageQuota.create({
      userId: new Types.ObjectId(userId),
      period,
      tokensUsed: 0,
      pdfsIngested: 0,
      feynmanSessions: 0,
    });
  }
  return quota;
}

export async function checkQuota(
  userId: string,
  type: QuotaType,
): Promise<{ allowed: boolean; used: number; limit: number; tier: string }> {
  const user = await User.findById(userId).lean();
  const tier = (user as { subscription?: { tier?: string } } | null)?.subscription?.tier ?? 'free';

  if (tier === 'pro') {
    return { allowed: true, used: 0, limit: -1, tier };
  }
  if (type === 'tokensUsed' && process.env.LLM_PROVIDER === 'local') {
    return { allowed: true, used: 0, limit: -1, tier };
  }

  const quota = await getOrCreate(userId);
  const used = quota[type] as number;
  const limit = FREE_LIMITS[type];
  return { allowed: used < limit, used, limit, tier };
}

export async function incrementQuota(userId: string, type: QuotaType, amount = 1): Promise<void> {
  const user = await User.findById(userId).lean();
  const tier = (user as { subscription?: { tier?: string } } | null)?.subscription?.tier ?? 'free';
  if (tier === 'pro') return;

  const period = currentPeriod();
  await UsageQuota.findOneAndUpdate(
    { userId: new Types.ObjectId(userId), period },
    { $inc: { [type]: amount } },
    { upsert: true },
  );
}

export interface QuotaResponse {
  _id:             string;
  userId:          string;
  period:          string;
  tokensUsed:      number;
  pdfsIngested:    number;
  feynmanSessions: number;
  tier:            'free' | 'pro';
  limits: Record<QuotaType, number>;
}

export async function getQuota(userId: string): Promise<QuotaResponse> {
  const [quota, user] = await Promise.all([
    getOrCreate(userId),
    User.findById(userId).lean(),
  ]);
  const tier = (user as { subscription?: { tier?: 'free' | 'pro' } } | null)?.subscription?.tier ?? 'free';
  // -1 ⇒ unlimited (matches checkQuota semantics).
  const limits: Record<QuotaType, number> = tier === 'pro'
    ? { pdfsIngested: -1, feynmanSessions: -1, tokensUsed: -1 }
    : FREE_LIMITS;
  return {
    _id:             quota._id.toString(),
    userId:          quota.userId.toString(),
    period:          quota.period,
    tokensUsed:      quota.tokensUsed,
    pdfsIngested:    quota.pdfsIngested,
    feynmanSessions: quota.feynmanSessions,
    tier,
    limits,
  };
}
