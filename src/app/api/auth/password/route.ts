import { z } from 'zod';
import { body, context, handler, HttpError, json } from '@/lib/api';
import { hashPassword, verifyPassword } from '@/lib/auth';
import { row, rows } from '@/lib/db';
import { password } from '@/lib/schemas';

/** Change your own password. */
export const POST = handler(async (req: Request) => {
  const c = await context();
  const input = await body(req, z.object({ current: z.string().min(1), next: password }));
  const me = await row<{ password_hash: string | null }>(`select password_hash from staff where id = $1`, [c.me.id]);
  if (!(await verifyPassword(input.current, me?.password_hash ?? null))) throw new HttpError(400, 'Current password is wrong');
  await rows(`update staff set password_hash = $2 where id = $1`, [c.me.id, await hashPassword(input.next)]);
  return json({ ok: true });
});
