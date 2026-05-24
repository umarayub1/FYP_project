// Server-side: use internal Docker service name; client-side: use public URL.
// Both include /api as the base path since all gateway routes are under /api/*.
export const GATEWAY_URL =
  typeof window === 'undefined'
    ? (process.env.GATEWAY_INTERNAL_URL ?? 'http://localhost:4000/api')
    : (process.env.NEXT_PUBLIC_GATEWAY_URL ?? 'http://localhost:4000/api');

export const ACCESS_COOKIE  = 'synapse_token';
export const REFRESH_COOKIE = 'synapse_refresh';
export const COOKIE_MAX_AGE = 60 * 15;            // 15 min — matches JWT expiry
export const REFRESH_MAX_AGE = 60 * 60 * 24 * 7;  // 7 days
