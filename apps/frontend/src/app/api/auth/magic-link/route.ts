import { NextRequest, NextResponse } from 'next/server';
import { GATEWAY_URL } from '@/lib/api/constants';

export async function POST(req: NextRequest) {
  const body = await req.json();

  const upstream = await fetch(`${GATEWAY_URL}/auth/magic-link`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await upstream.json().catch(() => ({}));
  return NextResponse.json(data, { status: upstream.status });
}
