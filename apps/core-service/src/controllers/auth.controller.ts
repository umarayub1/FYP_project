import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { User } from '../models/User';
import { generateToken, verifyToken } from '../lib/magicLink';
import { getRedis } from '../lib/redis';

// ── Token helpers ─────────────────────────────────────────────────────────────

export function signAccessToken(userId: string, email: string): string {
  return jwt.sign({ sub: userId, email }, process.env.JWT_SECRET!, { expiresIn: '15m' });
}

export function signRefreshToken(userId: string): string {
  const jti = crypto.randomUUID();
  return jwt.sign({ sub: userId, jti }, process.env.JWT_REFRESH_SECRET!, { expiresIn: '7d' });
}

function tokenPair(userId: string, email: string) {
  return {
    accessToken: signAccessToken(userId, email),
    refreshToken: signRefreshToken(userId),
  };
}

// ── Magic link ────────────────────────────────────────────────────────────────

export async function requestMagicLink(email: string): Promise<void> {
  const token = await generateToken(email.toLowerCase());
  const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';
  const magicLinkUrl = `${frontendUrl}/auth/callback?token=${token}`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM_EMAIL ?? 'noreply@synapse.app',
      to: email,
      subject: 'Your Synapse sign-in link',
      html: `<p>Click to sign in (expires in ${process.env.MAGIC_LINK_EXPIRY_MINUTES ?? 10} minutes):</p><a href="${magicLinkUrl}">${magicLinkUrl}</a>`,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error('[magicLink] Resend error', res.status, body);
    // Still don't throw — caller always returns 200 to prevent user enumeration
  }
}

export async function verifyMagicLink(
  token: string,
): Promise<{ user: ReturnType<(typeof User.prototype)['toJSON']>; accessToken: string; refreshToken: string; redirectTo: string }> {
  const email = await verifyToken(token);

  let user = await User.findOne({ email });
  if (!user) {
    user = await User.create({ email, onboardingComplete: false });
  }

  const userId = String(user._id);
  const tokens = tokenPair(userId, user.email);
  const redirectTo = user.onboardingComplete ? '/' : '/onboarding';

  return { user: user.toJSON(), ...tokens, redirectTo };
}

// ── Refresh ───────────────────────────────────────────────────────────────────

export async function refresh(refreshToken: string) {
  let payload: { sub: string; jti?: string };
  try {
    payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET!) as {
      sub: string;
      jti?: string;
    };
  } catch {
    const err = new Error('Invalid refresh token');
    (err as Error & { status: number }).status = 401;
    throw err;
  }

  // Check blocklist (only refresh tokens have jti)
  if (payload.jti) {
    const redis = getRedis();
    const blocked = await redis.get(`blocklist:${payload.jti}`);
    if (blocked) {
      const err = new Error('Token revoked');
      (err as Error & { status: number }).status = 401;
      throw err;
    }
  }

  const user = await User.findById(payload.sub);
  if (!user) {
    const err = new Error('User not found');
    (err as Error & { status: number }).status = 401;
    throw err;
  }

  return { ...tokenPair(String(user._id), user.email), user: user.toJSON() };
}

// ── Logout ────────────────────────────────────────────────────────────────────

export async function logout(refreshToken: string): Promise<void> {
  try {
    const payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET!) as {
      jti?: string;
      exp?: number;
    };
    if (payload.jti && payload.exp) {
      const ttl = payload.exp - Math.floor(Date.now() / 1000);
      if (ttl > 0) {
        const redis = getRedis();
        await redis.set(`blocklist:${payload.jti}`, '1', 'EX', ttl);
      }
    }
  } catch {
    // Invalid token — nothing to revoke
  }
}
