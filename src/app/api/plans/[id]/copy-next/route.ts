import { context, handler, HttpError, json, requireLead, type Params } from '@/lib/api';
import { ymAdd } from '@/lib/dates';
import { db, row } from '@/lib/db';
import { copyItems, loadPlan } from '@/lib/plans';

/** Clone a plan and its items into next month as a draft. Fixed dates are cleared. */
export const POST = handler(async (_req: Request, { params }: Params) => {
  const { id } = await params;
  const c = await context();
  requireLead(c);
  const { plan } = await loadPlan(db(), id);
  const next = `${ymAdd(plan.month.slice(0, 7), 1)}-01`;
  if (await row(`select 1 from plans where client_id = $1 and month = $2`, [plan.client_id, next])) {
    throw new HttpError(409, 'Next month already has a plan');
  }
  const copy = await db().transaction(c.me.id, async (tx) => {
    const p = (await row<{ id: string }>(`insert into plans (client_id, month, status, notes) values ($1, $2, 'draft', $3) returning *`,
      [plan.client_id, next, plan.notes], tx))!;
    await copyItems(tx, id, p.id);
    return p;
  });
  return json(copy, 201);
});
