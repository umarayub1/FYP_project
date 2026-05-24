import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { GATEWAY_URL, ACCESS_COOKIE } from '@/lib/api/constants';

async function authHeaders(): Promise<HeadersInit> {
  const jar = await cookies();
  const token = jar.get(ACCESS_COOKIE)?.value;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function POST() {
  const upstream = await fetch(`${GATEWAY_URL}/user/onboarding`, {
    method: 'POST',
    headers: await authHeaders(),
  });
  const data = await upstream.json().catch(() => ({}));
  return NextResponse.json(data, { status: upstream.status });
}
