import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { GATEWAY_URL, ACCESS_COOKIE } from '@/lib/api/constants';

async function authHeaders() {
  const jar = await cookies();
  const token = jar.get(ACCESS_COOKIE)?.value;
  return token ? { Authorization: `Bearer ${token}` } : {} as Record<string, string>;
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;
  const upstream = await fetch(`${GATEWAY_URL}/auth/sessions/${sessionId}`, {
    method: 'DELETE',
    headers: await authHeaders(),
  });
  if (upstream.status === 204) return new NextResponse(null, { status: 204 });
  const data = await upstream.json().catch(() => ({}));
  return NextResponse.json(data, { status: upstream.status });
}
