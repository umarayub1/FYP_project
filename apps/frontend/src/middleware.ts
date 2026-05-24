import { NextRequest, NextResponse } from 'next/server';
import { ACCESS_COOKIE } from '@/lib/api/constants';

const PUBLIC_PATHS = ['/signin', '/signup', '/api/auth'];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // /onboarding → /welcome (spec rename; remove after 2026-06-16).
  if (pathname === '/onboarding' || pathname.startsWith('/onboarding/')) {
    const url = req.nextUrl.clone();
    url.pathname = pathname.replace(/^\/onboarding/, '/welcome');
    return NextResponse.redirect(url, 308);
  }

  // Landing page is public (exact match — startsWith('/') would catch everything)
  if (pathname === '/') {
    return NextResponse.next();
  }

  // Allow public paths and static assets
  if (
    PUBLIC_PATHS.some(p => pathname.startsWith(p)) ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon')
  ) {
    return NextResponse.next();
  }

  const token = req.cookies.get(ACCESS_COOKIE)?.value;

  if (!token) {
    const url = req.nextUrl.clone();
    url.pathname = '/signin';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
