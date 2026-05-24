import { NextRequest, NextResponse } from 'next/server';
import { GATEWAY_URL, ACCESS_COOKIE, REFRESH_COOKIE, COOKIE_MAX_AGE, REFRESH_MAX_AGE } from '@/lib/api/constants';

export async function POST(req: NextRequest) {
  const body = await req.json();

  const upstream = await fetch(`${GATEWAY_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await upstream.json();

  if (!upstream.ok) {
    return NextResponse.json(data, { status: upstream.status });
  }

  const res = NextResponse.json({ user: data.user });

  res.cookies.set(ACCESS_COOKIE, data.accessToken, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge:   COOKIE_MAX_AGE,
    path:     '/',
  });

  res.cookies.set(REFRESH_COOKIE, data.refreshToken, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge:   REFRESH_MAX_AGE,
    path:     '/api/auth',
  });

  return res;
}
