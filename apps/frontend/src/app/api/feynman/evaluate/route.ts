import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { GATEWAY_URL, ACCESS_COOKIE } from '@/lib/api/constants';

export async function POST(req: NextRequest) {
  const jar = await cookies();
  const token = jar.get(ACCESS_COOKIE)?.value;
  const body = await req.json();

  const upstream = await fetch(`${GATEWAY_URL}/ai/feynman/evaluate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

  const data = await upstream.json().catch(() => ({}));
  return NextResponse.json(data, { status: upstream.status });
}
