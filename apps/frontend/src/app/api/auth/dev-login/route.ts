import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { ACCESS_COOKIE } from '@/lib/api/constants';

const DEV_USER_ID    = '000000000000000000000001';
const DEV_USER_EMAIL = 'dev@localhost';
// Dev-login bypasses magic-link, so there is no refresh token to use the
// silent-refresh flow with. Give the dev JWT a long lifetime so testing
// sessions aren't interrupted.
const DEV_TOKEN_TTL_SECONDS = 60 * 60 * 8; // 8h

function base64url(value: string | Buffer): string {
  const b64 = Buffer.isBuffer(value)
    ? value.toString('base64')
    : Buffer.from(value).toString('base64');
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function signJwt(payload: Record<string, unknown>, secret: string): string {
  const header  = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const now     = Math.floor(Date.now() / 1000);
  const body    = base64url(JSON.stringify({ ...payload, iat: now, exp: now + DEV_TOKEN_TTL_SECONDS }));
  const sig     = base64url(crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest());
  return `${header}.${body}.${sig}`;
}

export async function POST() {
  if (process.env.ENABLE_DEV_LOGIN !== 'true') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'JWT_SECRET not configured' }, { status: 500 });
  }

  const accessToken = signJwt({ sub: DEV_USER_ID, email: DEV_USER_EMAIL }, secret);

  const res = NextResponse.json({ ok: true });
  res.cookies.set(ACCESS_COOKIE, accessToken, {
    httpOnly: true,
    secure: false,
    sameSite: 'lax',
    maxAge: DEV_TOKEN_TTL_SECONDS,
    path: '/',
  });

  return res;
}
