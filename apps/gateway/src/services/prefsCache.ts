import { coreUrl, proxyTo } from './proxy.service';

export interface UserPrefs {
  llmProvider?: string;
  llmModel?: string;
}

const cache = new Map<string, { prefs: UserPrefs; expiresAt: number }>();

export async function getPrefsFromCache(userId: string): Promise<UserPrefs> {
  const cached = cache.get(userId);
  if (cached && cached.expiresAt > Date.now()) return cached.prefs;

  try {
    const { body } = await proxyTo(coreUrl(`/internal/user-preferences/${userId}`), { method: 'GET' });
    const prefs = body as UserPrefs;
    cache.set(userId, { prefs, expiresAt: Date.now() + 60_000 });
    return prefs;
  } catch {
    return {};
  }
}

// Called from the PATCH /user/preferences handler so model switches take
// effect on the next AI call instead of waiting up to 60s for the TTL.
export function invalidatePrefs(userId: string): void {
  cache.delete(userId);
}
