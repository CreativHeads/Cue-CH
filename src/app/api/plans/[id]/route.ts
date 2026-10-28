import { body, context, found, handler, HttpError, json, requireLead, type Params } from '@/lib/api';
import { db, row, setClause } from '@/lib/db';
import { loadPlan, runGeneration } from '@/lib/plans';
import { planPatch } from '@/lib/schemas';

export const GET = handler(async (_req: Request, { params }: Params) => {
  const { id } = await params;
  await context();
  const { plan, items } = await loadPlan(db(), id);
  return json({ plan, items, preview: await runGeneration(db(), id, true) });
});

/** Update notes or status. Activating a draft generates its tasks in the same transaction. */
export const PATCH = handler(async (req: Request, { params }: Params) => {
  const { id } = await params;
  const c = await context();
  requireLead(c);
  const input = await body(req, planPatch);
  const set = setClause(input, ['status', 'notes'], 1);
  if (!set.sql) throw new HttpError(400, 'Nothing to update');
  return json(await db().transaction(c.me.id, async (tx) => {
    const plan = found(await row(`update plans set ${set.sql} where id = $1 returning *`, [id, ...set.params], tx), 'Plan');
    const generation = input.status === 'active' ? await runGeneration(tx, id, false) : null;
    return { plan, generation };
  }));
});
