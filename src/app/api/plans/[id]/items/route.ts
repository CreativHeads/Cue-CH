import { body, context, handler, json, requireLead, type Params } from '@/lib/api';
import { row, setClause } from '@/lib/db';
import { PLAN_ITEM_COLS, planItemInput } from '@/lib/schemas';

export const POST = handler(async (req: Request, { params }: Params) => {
  const { id } = await params;
  const c = await context();
  requireLead(c);
  const input = await body(req, planItemInput);
  const cols = PLAN_ITEM_COLS.filter((k) => input[k] !== undefined);
  const { params: values } = setClause(input, cols);
  return json(await row(
    `insert into plan_items (plan_id, ${cols.join(', ')}) values ($1, ${cols.map((_, i) => `$${i + 2}`).join(', ')}) returning *`,
    [id, ...values]), 201);
});
