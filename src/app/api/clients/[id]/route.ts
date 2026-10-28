import { body, context, found, handler, HttpError, json, requireAdmin, type Params } from '@/lib/api';
import { row, setClause } from '@/lib/db';
import { CLIENT_COLS, clientInput } from '@/lib/schemas';

export const GET = handler(async (_req: Request, { params }: Params) => {
  const { id } = await params;
  await context();
  return json(found(await row(`select * from clients where id = $1`, [id]), 'Client'));
});

export const PATCH = handler(async (req: Request, { params }: Params) => {
  const { id } = await params;
  const c = await context();
  requireAdmin(c);
  const set = setClause(await body(req, clientInput.partial()), CLIENT_COLS, 1);
  if (!set.sql) throw new HttpError(400, 'Nothing to update');
  return json(found(await row(`update clients set ${set.sql} where id = $1 returning *`, [id, ...set.params]), 'Client'));
});
