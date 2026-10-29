import { body, context, found, handler, HttpError, json, requireLead, type Params } from '@/lib/api';
import { todayIST, toDueAt } from '@/lib/dates';
import { db, row, setClause } from '@/lib/db';
import { runGeneration } from '@/lib/plans';
import { PLAN_ITEM_COLS, planItemInput } from '@/lib/schemas';
import type { Plan, PlanItem } from '@/lib/types';

export const PATCH = handler(async (req: Request, { params }: Params) => {
  const { id } = await params;
  const c = await context();
  requireLead(c);
  const set = setClause(await body(req, planItemInput.partial()), PLAN_ITEM_COLS, 1);
  if (!set.sql) throw new HttpError(400, 'Nothing to update');
  return json(await db().transaction(c.me.id, async (tx) => {
    const item = found(await row<PlanItem>(`update plan_items set ${set.sql} where id = $1 returning *`, [id, ...set.params], tx), 'Plan line');
    const plan = await row<Plan>(`select * from plans where id = $1`, [item.plan_id], tx);
    if (plan?.status === 'active') {
      await runGeneration(tx, plan.id, false);
    }
    return item;
  }));
});

/** Remove a package line. Its untouched future tasks go with it; started or past work stays as manual tasks. */
export const DELETE = handler(async (_req: Request, { params }: Params) => {
  const { id } = await params;
  const c = await context();
  requireLead(c);
  await db().transaction(c.me.id, async (tx) => {
    const item = await row<PlanItem>(`select * from plan_items where id = $1`, [id], tx);
    await tx.query(`delete from tasks where plan_item_id = $1 and stage = 'to_brief' and posted_at is null and due_at >= $2`,
      [id, toDueAt(todayIST(), '00:00')]);
    await tx.query(`delete from plan_items where id = $1`, [id]);
    if (item) {
      const plan = await row<Plan>(`select * from plans where id = $1`, [item.plan_id], tx);
      if (plan?.status === 'active') {
        await runGeneration(tx, plan.id, false);
      }
    }
  });
  return json({ ok: true });
});
