const CORE = process.env.CORE_SERVICE_URL ?? 'http://core-service:4001';
const AI_ENGINE = process.env.AI_ENGINE_URL ?? 'http://ai-engine:8000';
const INTERNAL_SECRET = process.env.INTERNAL_SECRET ?? '';

export async function proxyTo(
  url: string,
  options: RequestInit,
): Promise<{ status: number; body: unknown }> {
  const existingHeaders = (options.headers as Record<string, string>) ?? {};
  const res = await fetch(url, {
    ...options,
    headers: { ...existingHeaders, 'x-internal-secret': INTERNAL_SECRET },
  });
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    body = { error: 'Upstream returned non-JSON response' };
  }
  return { status: res.status, body };
}


export function coreUrl(path: string): string {
  return `${CORE}${path}`;
}

export function aiEngineUrl(path: string): string {
  return `${AI_ENGINE}${path}`;
}
