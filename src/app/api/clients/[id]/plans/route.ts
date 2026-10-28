import { body, context, handler, HttpError, json, requireLead, type Params } from '@/lib/api';
import { db, row, rows } from '@/lib/db';
import { copyItems } from '@/lib/plans';
import { planCreate } from '@/lib/schemas';

/** Plans for a client, newest month first, each with its items. */
export const GET = handler(async (_req: Request, { params }: Params) => {
  const { id } = await params;
  await context();
  return json(await rows(
    `select p.*, coalesce((select json_agg(i order by i.sort, i.created_at) from plan_items i where i.plan_id = p.id), '[]') as plan_items
       from plans p where p.client_id = $1 order by p.month desc`, [id]));
});

/** Create a draft plan for a month, optionally copying another plan's items. */
export const POST = handler(async (req: Request, { params }: Params) => {
  const { id } = await params;
  const c = await context();
  requireLead(c);
  const { month, copy_from } = await body(req, planCreate);
  if (await row(`select 1 from plans where client_id = $1 and month = $2`, [id, `${month}-01`])) {
    throw new HttpError(409, 'This client already has a plan for that month');
  }
  const plan = await db().transaction(c.me.id, async (tx) => {
    const p = (await row<{ id: string }>(`insert into plans (client_id, month, status) values ($1, $2, 'draft') returning *`, [id, `${month}-01`], tx))!;
    if (copy_from) await copyItems(tx, copy_from, p.id);
    return p;
  });
  return json(plan, 201);
});
