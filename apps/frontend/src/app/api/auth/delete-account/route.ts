import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { GATEWAY_URL, ACCESS_COOKIE, REFRESH_COOKIE } from '@/lib/api/constants';

export async function POST() {
  const jar = await cookies();
  const token = jar.get(ACCESS_COOKIE)?.value;

  const upstream = await fetch(`${GATEWAY_URL}/auth/delete-account`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  const data = await upstream.json().catch(() => ({}));
  const res = NextResponse.json(data, { status: upstream.status });

  if (upstream.ok) {
    res.cookies.set(ACCESS_COOKIE,  '', { maxAge: 0, path: '/' });
    res.cookies.set(REFRESH_COOKIE, '', { maxAge: 0, path: '/api/auth' });
  }

  return res;
}
