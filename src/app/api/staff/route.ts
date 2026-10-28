import { body, context, handler, json, requireAdmin } from '@/lib/api';
import { hashPassword } from '@/lib/auth';
import { row, rows } from '@/lib/db';
import { staffCreate } from '@/lib/schemas';
import { STAFF_SELECT } from '@/lib/types';

export const GET = handler(async () => {
  await context();
  return json(await rows(`select ${STAFF_SELECT} from staff order by case role when 'admin' then 0 when 'lead' then 1 else 2 end, name`));
});

/** Admin adds a teammate with a starting password they share with them. */
export const POST = handler(async (req: Request) => {
  const c = await context();
  requireAdmin(c);
  const s = await body(req, staffCreate);
  return json(await row(
    `insert into staff (name, email, role, title, password_hash) values ($1, $2, $3, $4, $5) returning ${STAFF_SELECT}`,
    [s.name, s.email, s.role, s.title ?? null, await hashPassword(s.password)]), 201);
});
