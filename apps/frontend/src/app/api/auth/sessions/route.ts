import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { GATEWAY_URL, ACCESS_COOKIE } from '@/lib/api/constants';

async function authHeaders() {
  const jar = await cookies();
  const token = jar.get(ACCESS_COOKIE)?.value;
  return token ? { Authorization: `Bearer ${token}` } : {} as Record<string, string>;
}

export async function GET() {
  const upstream = await fetch(`${GATEWAY_URL}/auth/sessions`, {
    method: 'GET',
    headers: await authHeaders(),
  });
  const data = await upstream.json().catch(() => []);
  return NextResponse.json(data, { status: upstream.status });
}
