import { NextRequest, NextResponse } from 'next/server';
import { ACCESS_COOKIE, GATEWAY_URL } from '@/lib/api/constants';

export async function GET(req: NextRequest) {
  const token = req.cookies.get(ACCESS_COOKIE)?.value;
  if (!token) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  // Validate by calling an authenticated gateway endpoint
  const upstream = await fetch(`${GATEWAY_URL}/study-sets`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (upstream.status === 401) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }

  // Decode user from JWT (no secret needed — payload is public)
  const [, payload] = token.split('.');
  const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString());

  return NextResponse.json({
    user: { id: decoded.sub, email: decoded.email },
  });
}
