import { NextRequest, NextResponse } from 'next/server';
import { GATEWAY_URL, ACCESS_COOKIE } from '@/lib/api/constants';

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const token = req.cookies.get(ACCESS_COOKIE)?.value;
  if (!token) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  const { id } = await ctx.params;

  // Forward Range so pdfjs can use HTTP range requests for large PDFs.
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  const range = req.headers.get('range');
  if (range) headers.Range = range;

  const upstream = await fetch(`${GATEWAY_URL}/documents/${encodeURIComponent(id)}/file`, {
    method: 'GET',
    headers,
  });

  if (upstream.status >= 400) {
    return NextResponse.json({ error: 'Failed to fetch file' }, { status: upstream.status });
  }

  // Pass through critical response headers.
  const responseHeaders = new Headers();
  responseHeaders.set('Content-Type', upstream.headers.get('content-type') ?? 'application/pdf');
  const contentLength = upstream.headers.get('content-length');
  if (contentLength) responseHeaders.set('Content-Length', contentLength);
  const acceptRanges = upstream.headers.get('accept-ranges');
  if (acceptRanges) responseHeaders.set('Accept-Ranges', acceptRanges);
  const contentRange = upstream.headers.get('content-range');
  if (contentRange) responseHeaders.set('Content-Range', contentRange);

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}
