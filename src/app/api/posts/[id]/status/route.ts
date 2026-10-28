import { z } from 'zod';
import { body, context, found, handler, json, requireLead, type Params } from '@/lib/api';
import { db, row } from '@/lib/db';
import { unmatchTask } from '@/lib/matching';

/**
 * Lead marks a post extra or ignored, or sends it back to review ("undo").
 * A matched post is detached from its task first.
 */
export const POST = handler(async (req: Request, { params }: Params) => {
  const { id } = await params;
  const c = await context();
  requireLead(c);
  const { status } = await body(req, z.object({ status: z.enum(['extra', 'ignored', 'pending_review']) }));
  found(await row(`select 1 from ig_posts where id = $1`, [id]), 'Post');
  await db().transaction(c.me.id, async (tx) => {
    const task = await row<{ id: string }>(`select id from tasks where post_id = $1`, [id], tx);
    if (task) await unmatchTask(tx, task.id, c.me.id);
    // back to review = let the next automatic run decide again
    const manual = status !== 'pending_review';
    await tx.query(`update ig_posts set status = $2, manual = $3, decided_by = $4, suggested_task_id = case when $3 then null else suggested_task_id end where id = $1`,
      [id, status, manual, manual ? c.me.id : null]);
  });
  return json({ ok: true });
});
