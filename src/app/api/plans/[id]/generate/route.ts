import { context, handler, json, requireLead, type Params } from '@/lib/api';
import { db } from '@/lib/db';
import { runGeneration } from '@/lib/plans';

// POST /api/plans/:id/generate?dry_run=true previews; without it, tasks are created/updated idempotently.
export const POST = handler(async (req: Request, { params }: Params) => {
  const { id } = await params;
  const c = await context();
  const dryRun = new URL(req.url).searchParams.get('dry_run') === 'true';
  if (dryRun) return json(await runGeneration(db(), id, true));
  requireLead(c);
  return json(await db().transaction(c.me.id, (tx) => runGeneration(tx, id, false)));
});
