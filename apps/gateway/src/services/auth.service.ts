const CORE = process.env.CORE_SERVICE_URL ?? 'http://core-service:4001';
const INTERNAL_SECRET = process.env.INTERNAL_SECRET ?? '';

async function corePost(path: string, body: unknown) {
  const res = await fetch(`${CORE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-secret': INTERNAL_SECRET,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return { status: res.status, data };
}

// Removed: magic link auth replaces password auth (registerUser, loginUser)

export async function sendMagicLink(email: string) {
  return corePost('/internal/auth/magic-link', { email });
}

export async function verifyCallback(token: string) {
  return corePost('/internal/auth/callback', { token });
}

export async function refreshTokens(refreshToken: string) {
  return corePost('/internal/auth/refresh', { refreshToken });
}

export async function logoutUser(refreshToken: string) {
  return corePost('/internal/auth/logout', { refreshToken });
}
