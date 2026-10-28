import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { deleteSession, SESSION_COOKIE } from '@/lib/auth';

export async function POST(req: Request) {
  const store = await cookies();
  await deleteSession(store.get(SESSION_COOKIE)?.value);
  store.delete(SESSION_COOKIE);
  return NextResponse.redirect(new URL('/signin', req.url), { status: 303 });
}
