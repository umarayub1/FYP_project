import { NextRequest, NextResponse } from 'next/server';
import {
  GATEWAY_URL,
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  COOKIE_MAX_AGE,
  REFRESH_MAX_AGE,
} from '@/lib/api/constants';

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  if (!token) {
    return NextResponse.json({ error: 'Missing token' }, { status: 400 });
  }

  const upstream = await fetch(
    `${GATEWAY_URL}/auth/callback?token=${encodeURIComponent(token)}`,
  );
  const data = await upstream.json().catch(() => ({}));

  if (!upstream.ok) {
    return NextResponse.json(data, { status: upstream.status });
  }

  const res = NextResponse.json({
    user: { id: data.user?._id ?? data.user?.id, email: data.user?.email },
    redirectTo: data.redirectTo ?? '/',
  });

  res.cookies.set(ACCESS_COOKIE, data.accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: COOKIE_MAX_AGE,
    path: '/',
  });

  res.cookies.set(REFRESH_COOKIE, data.refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: REFRESH_MAX_AGE,
    path: '/api/auth',
  });

  return res;
}
