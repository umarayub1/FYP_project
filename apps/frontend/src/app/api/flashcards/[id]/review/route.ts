import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { GATEWAY_URL, ACCESS_COOKIE } from '@/lib/api/constants';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const jar = await cookies();
  const token = jar.get(ACCESS_COOKIE)?.value;

  const body = await req.json();

  const upstream = await fetch(`${GATEWAY_URL}/flashcards/${id}/review`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

  if (!upstream.ok) {
    return NextResponse.json({ error: 'Review submission failed' }, { status: upstream.status });
  }

  const data = await upstream.json().catch(() => ({}));
  return NextResponse.json(data);
}
