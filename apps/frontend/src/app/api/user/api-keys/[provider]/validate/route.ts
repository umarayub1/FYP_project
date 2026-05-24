import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { GATEWAY_URL, ACCESS_COOKIE } from '@/lib/api/constants';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider } = await params;
  const jar = await cookies();
  const token = jar.get(ACCESS_COOKIE)?.value;
  if (!token) {
    return NextResponse.json({ ok: false, code: 'invalid_key' }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const upstream = await fetch(`${GATEWAY_URL}/user/api-keys/${provider}/validate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const data = await upstream.json().catch(() => ({}));
  return NextResponse.json(data, { status: upstream.status });
}
