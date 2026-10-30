import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { z } from 'zod';
import { SESSION_COOKIE, staffForToken } from './auth';
import type { Staff } from './types';
import { HttpError } from './errors';

export { HttpError };

export const json = (data: unknown, status = 200) => NextResponse.json(data, { status });
export const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });


export interface Ctx { me: Staff; isLead: boolean; isAdmin: boolean; isViewer: boolean }

/** Resolve the signed-in staff member from the session cookie. */
export async function context(): Promise<Ctx> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const me = await staffForToken(token);
  if (!me) throw new HttpError(401, 'Not signed in');
  const isViewer = me.role === 'viewer';
  return {
    me,
    isLead: !isViewer && (me.role === 'admin' || me.role === 'lead'),
    isAdmin: !isViewer && me.role === 'admin',
    isViewer,
  };
}

export function requireLead(c: Ctx) { if (!c.isLead) throw new HttpError(403, 'Only the lead or admin can do this'); }
export function requireAdmin(c: Ctx) { if (!c.isAdmin) throw new HttpError(403, 'Only the admin can do this'); }
export function requireNotViewer(c: Ctx) { if (c.isViewer) throw new HttpError(403, 'Read-only access: viewers cannot make changes'); }
export function found<T>(v: T | null | undefined, what: string): T {
  if (v == null) throw new HttpError(404, `${what} not found`);
  return v;
}

export async function body<T extends z.ZodType>(req: Request, schema: T): Promise<z.infer<T>> {
  let raw: unknown;
  try { raw = await req.json(); } catch { throw new HttpError(400, 'Invalid JSON body'); }
  const r = schema.safeParse(raw);
  if (!r.success) throw new HttpError(400, r.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; '));
  return r.data;
}

/** Wrap a route handler with consistent JSON errors; maps common Postgres errors to 4xx. */
export function handler<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A) => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof HttpError) return fail(e.message, e.status);
      const code = (e as { code?: string }).code;
      if (code === '23505') return fail('That already exists', 409);
      if (code === '23503') return fail('A linked record does not exist', 400);
      if (code === '22P02') return fail('Invalid id', 400);
      console.error(e);
      return fail('Something went wrong', 500);
    }
  };
}

export type Params = { params: Promise<{ id: string }> };
