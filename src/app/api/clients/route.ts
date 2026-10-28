import { body, context, handler, json, requireAdmin } from '@/lib/api';
import { row, rows, setClause } from '@/lib/db';
import { CLIENT_COLS, clientInput } from '@/lib/schemas';

export const GET = handler(async () => {
  await context();
  return json(await rows(`select * from clients order by name`));
});

export const POST = handler(async (req: Request) => {
  const c = await context();
  requireAdmin(c);
  const input = await body(req, clientInput);
  const { params } = setClause(input, CLIENT_COLS);
  const cols = CLIENT_COLS.filter((k) => input[k] !== undefined);
  return json(await row(`insert into clients (${cols.join(', ')}) values (${cols.map((_, i) => `$${i + 1}`).join(', ')}) returning *`, params), 201);
});
