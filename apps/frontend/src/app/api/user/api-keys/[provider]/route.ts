import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { GATEWAY_URL, ACCESS_COOKIE } from '@/lib/api/constants';

async function authHeaders(): Promise<HeadersInit> {
  const jar = await cookies();
  const token = jar.get(ACCESS_COOKIE)?.value;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider } = await params;
  const upstream = await fetch(`${GATEWAY_URL}/user/api-keys/${provider}`, {
    method: 'DELETE',
    headers: await authHeaders(),
  });
  if (upstream.status === 204) return new NextResponse(null, { status: 204 });
  const data = await upstream.json().catch(() => ({}));
  return NextResponse.json(data, { status: upstream.status });
}
