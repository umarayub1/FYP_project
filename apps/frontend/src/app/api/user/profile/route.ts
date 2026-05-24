import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { GATEWAY_URL, ACCESS_COOKIE } from '@/lib/api/constants';

async function authHeaders(): Promise<HeadersInit> {
  const jar = await cookies();
  const token = jar.get(ACCESS_COOKIE)?.value;
  return token
    ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    : { 'Content-Type': 'application/json' };
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const upstream = await fetch(`${GATEWAY_URL}/user/profile`, {
    method: 'PATCH',
    headers: await authHeaders(),
    body: JSON.stringify(body),
  });
  const data = await upstream.json().catch(() => ({}));
  return NextResponse.json(data, { status: upstream.status });
}
