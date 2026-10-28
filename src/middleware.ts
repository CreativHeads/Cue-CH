import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC = ['/signin', '/api/auth/login'];

// Cheap gate: no session cookie → sign-in. The API validates the session itself on every request.
export function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  if (PUBLIC.some((p) => path.startsWith(p)) || req.cookies.has('ch_session')) return NextResponse.next();
  if (path.startsWith('/api/')) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = '/signin';
  url.search = '';
  return NextResponse.redirect(url);
}

export const config = {
  // scheduled-job and Telegram endpoints (later phases) authenticate with their own secrets
  // images (logo, icons) stay public so the sign-in page can show them
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/cron|api/telegram|.*\.(?:png|ico|svg|jpg|webp)$).*)'],
};
