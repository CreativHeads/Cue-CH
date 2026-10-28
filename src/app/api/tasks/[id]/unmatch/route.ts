import { context, handler, json, requireLead, type Params } from '@/lib/api';
import { db } from '@/lib/db';
import { unmatchTask } from '@/lib/matching';

/** Detach the matched post: the task returns to Scheduled and the post goes back to the review queue. */
export const POST = handler(async (_req: Request, { params }: Params) => {
  const { id } = await params;
  const c = await context();
  requireLead(c);
  await db().transaction(c.me.id, (tx) => unmatchTask(tx, id, c.me.id));
  return json({ ok: true });
});
