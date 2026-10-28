import { body, context, handler, json, type Params } from '@/lib/api';
import { db } from '@/lib/db';
import { markPosted } from '@/lib/schemas';
import { markTaskPosted } from '@/lib/tasks';

/** Manual fallback: the owner marks a task posted, optionally with its permalink. Verified later by matching. */
export const POST = handler(async (req: Request, { params }: Params) => {
  const { id } = await params;
  const c = await context();
  return json(await markTaskPosted(db(), { id: c.me.id, isLead: c.isLead }, id, await body(req, markPosted)));
});
