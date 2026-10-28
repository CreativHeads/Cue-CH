import { body, context, found, handler, HttpError, json, requireAdmin, type Params } from '@/lib/api';
import { hashPassword } from '@/lib/auth';
import { db, row, setClause } from '@/lib/db';
import { staffPatch } from '@/lib/schemas';
import { STAFF_SELECT } from '@/lib/types';

/**
 * Admin updates a teammate. A new password or deactivation signs them out everywhere;
 * deactivation can hand all their open tasks to someone else in the same call.
 */
export const PATCH = handler(async (req: Request, { params }: Params) => {
  const { id } = await params;
  const c = await context();
  requireAdmin(c);
  const { reassign_to, password, ...input } = await body(req, staffPatch);
  if (id === c.me.id && (input.is_active === false || (input.role && input.role !== 'admin'))) {
    throw new HttpError(400, 'You can’t deactivate or demote yourself');
  }
  const patch: Record<string, unknown> = { ...input, ...(password ? { password_hash: await hashPassword(password) } : {}) };
  const set = setClause(patch, ['name', 'role', 'title', 'is_active', 'password_hash'], 1);

  return json(await db().transaction(c.me.id, async (tx) => {
    if (reassign_to) await tx.query(`update tasks set owner_id = $2 where owner_id = $1 and stage <> 'posted'`, [id, reassign_to]);
    if (password || input.is_active === false) await tx.query(`delete from sessions where staff_id = $1`, [id]);
    if (!set.sql) return found(await row(`select ${STAFF_SELECT} from staff where id = $1`, [id], tx), 'Teammate');
    return found(await row(`update staff set ${set.sql} where id = $1 returning ${STAFF_SELECT}`, [id, ...set.params], tx), 'Teammate');
  }));
});
