import { body, context, handler, json, requireLead, type Params } from '@/lib/api';
import { db, row, setClause } from '@/lib/db';
import { runGeneration } from '@/lib/plans';
import { PLAN_ITEM_COLS, planItemInput } from '@/lib/schemas';
import type { Plan, PlanItem } from '@/lib/types';

export const POST = handler(async (req: Request, { params }: Params) => {
  const { id } = await params;
  const c = await context();
  requireLead(c);
  const input = await body(req, planItemInput);
  const cols = PLAN_ITEM_COLS.filter((k) => input[k] !== undefined);
  const { params: values } = setClause(input, cols);

  return json(await db().transaction(c.me.id, async (tx) => {
    const item = await row<PlanItem>(
      `insert into plan_items (plan_id, ${cols.join(', ')}) values ($1, ${cols.map((_, i) => `$${i + 2}`).join(', ')}) returning *`,
      [id, ...values],
      tx
    );
    const plan = await row<Plan>(`select * from plans where id = $1`, [id], tx);
    if (plan?.status === 'active') {
      await runGeneration(tx, id, false);
    }
    return item;
  }), 201);
});
