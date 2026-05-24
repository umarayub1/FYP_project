import { GATEWAY_URL, ACCESS_COOKIE } from './constants';

function notify401() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('synapse:session-expired'));
  }
}

// Singleton in-flight refresh so concurrent 401s share one round-trip.
// Only used on the client — server-side requests carry the cookie from the
// incoming request and can't mutate the user's cookie jar.
let refreshInFlight: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    try {
      const res = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include',
      });
      return res.ok;
    } catch {
      return false;
    } finally {
      // Release the lock on the next microtask so callers awaiting this
      // promise still see the resolved value.
      queueMicrotask(() => { refreshInFlight = null; });
    }
  })();

  return refreshInFlight;
}

async function rawGatewayFetch(
  path: string,
  options: RequestInit,
): Promise<Response> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  const isServer = typeof window === 'undefined';

  if (isServer) {
    try {
      const { cookies } = await import('next/headers');
      const jar = await cookies();
      const token = jar.get(ACCESS_COOKIE)?.value;
      if (token) headers['Authorization'] = `Bearer ${token}`;
    } catch {
      // outside a request context (e.g. static generation)
    }
  }

  return fetch(`${GATEWAY_URL}${path}`, {
    ...options,
    headers,
    ...(isServer ? {} : { credentials: 'include' }),
  });
}

export async function gatewayFetch(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const res = await rawGatewayFetch(path, options);

  // Client-side: on 401, try a one-shot refresh and replay the request.
  if (res.status === 401 && typeof window !== 'undefined') {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      return rawGatewayFetch(path, options);
    }
    notify401();
  }

  return res;
}

async function throwGatewayError(res: Response, path: string): Promise<never> {
  let errBody: Record<string, unknown> = {};
  try { errBody = await res.json() as Record<string, unknown>; } catch { /* non-JSON body */ }
  throw Object.assign(new Error(`Gateway ${res.status}: ${path}`), { status: res.status, body: errBody });
}

export async function gatewayGet<T>(path: string): Promise<T> {
  const res = await gatewayFetch(path);
  if (!res.ok) await throwGatewayError(res, path);
  return res.json() as Promise<T>;
}

export async function gatewayPost<T>(path: string, body: unknown): Promise<T> {
  const res = await gatewayFetch(path, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  if (!res.ok) await throwGatewayError(res, path);
  return res.json() as Promise<T>;
}

export async function gatewayPatch<T>(path: string, body: unknown): Promise<T> {
  const res = await gatewayFetch(path, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
  if (!res.ok) await throwGatewayError(res, path);
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export async function gatewayDelete(path: string): Promise<void> {
  const res = await gatewayFetch(path, { method: 'DELETE' });
  if (!res.ok) await throwGatewayError(res, path);
}
