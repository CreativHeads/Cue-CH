import { cookies, headers } from 'next/headers';
import { z } from 'zod';
import { body, handler, HttpError, json } from '@/lib/api';
import { createSession, loginBlocked, loginFailed, loginSucceeded, SESSION_COOKIE, SESSION_DAYS, verifyPassword } from '@/lib/auth';
import { row } from '@/lib/db';

export const POST = handler(async (req: Request) => {
  const { email, password } = await body(req, z.object({ email: z.string().trim().email(), password: z.string().min(1) }));
  const ip = (await headers()).get('x-forwarded-for')?.split(',')[0].trim() ?? 'local';
  const key = `${email.toLowerCase()}|${ip}`;
  if (loginBlocked(key)) throw new HttpError(429, 'Too many attempts. Try again in 15 minutes.');

  const staff = await row<{ id: string; password_hash: string | null }>(
    `select id, password_hash from staff where lower(email) = lower($1) and is_active`, [email]);
  if (!staff || !(await verifyPassword(password, staff.password_hash))) {
    loginFailed(key);
    throw new HttpError(401, 'Wrong email or password');
  }
  loginSucceeded(key);
  const token = await createSession(staff.id);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true, sameSite: 'lax', path: '/', maxAge: SESSION_DAYS * 86400,
    secure: process.env.NODE_ENV === 'production' && process.env.INSECURE_COOKIES !== 'true',
  });
  return json({ ok: true });
});
