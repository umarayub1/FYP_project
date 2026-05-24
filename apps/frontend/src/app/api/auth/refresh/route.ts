import { NextRequest, NextResponse } from 'next/server';
import { GATEWAY_URL, ACCESS_COOKIE, REFRESH_COOKIE, COOKIE_MAX_AGE, REFRESH_MAX_AGE } from '@/lib/api/constants';

export async function POST(req: NextRequest) {
  const refreshToken = req.cookies.get(REFRESH_COOKIE)?.value;

  if (!refreshToken) {
    return NextResponse.json({ error: 'No refresh token' }, { status: 401 });
  }

  const upstream = await fetch(`${GATEWAY_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });

  const data = await upstream.json();

  if (!upstream.ok) {
    const res = NextResponse.json(data, { status: upstream.status });
    res.cookies.delete(ACCESS_COOKIE);
    res.cookies.delete(REFRESH_COOKIE);
    return res;
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
