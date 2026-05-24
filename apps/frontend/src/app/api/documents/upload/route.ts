import { NextRequest, NextResponse } from 'next/server';
import { GATEWAY_URL, ACCESS_COOKIE } from '@/lib/api/constants';

export async function POST(req: NextRequest) {
  const token = req.cookies.get(ACCESS_COOKIE)?.value;
  if (!token) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  // Stream the multipart body straight through to the gateway
  const body = await req.formData();

  const upstream = await fetch(`${GATEWAY_URL}/documents`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body,
  });

  const data = await upstream.json();
  return NextResponse.json(data, { status: upstream.status });
}
