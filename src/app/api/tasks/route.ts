import { body, context, handler, HttpError, json } from '@/lib/api';
import { addDays, toDueAt } from '@/lib/dates';
import { db, rows } from '@/lib/db';
import { runGeneration } from '@/lib/plans';
import { date, taskCreate, uuid } from '@/lib/schemas';
import { createTask } from '@/lib/tasks';
import { STAGES } from '@/lib/types';

// GET /api/tasks?client=&owner=&stage=&from=&to=&open=true  (from/to are IST dates, inclusive)
export const GET = handler(async (req: Request) => {
  await context();

  // Self-heal: ensure active plans with items have their tasks generated
  const ungenerated = await rows<{ id: string }>(
    `select p.id from plans p
     where p.status = 'active'
       and exists (select 1 from plan_items pi where pi.plan_id = p.id)
       and not exists (select 1 from tasks t where t.plan_item_id in (select id from plan_items where plan_id = p.id))`
  );
  for (const p of ungenerated) {
    try {
      await runGeneration(db(), p.id, false);
    } catch (e) {
      console.error('Failed to auto-generate tasks for plan', p.id, e);
    }
  }

  const q = new URL(req.url).searchParams;
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (sql: string, v: unknown) => { params.push(v); where.push(sql.replace('?', `$${params.length}`)); };
  const check = (ok: boolean, msg: string) => { if (!ok) throw new HttpError(400, msg); };

  const client = q.get('client'), owner = q.get('owner'), stage = q.get('stage'), from = q.get('from'), to = q.get('to');
  if (client) { check(uuid.safeParse(client).success, 'client: invalid id'); add('client_id = ?', client); }
  if (owner) { check(uuid.safeParse(owner).success, 'owner: invalid id'); add('owner_id = ?', owner); }
  if (stage) { check((STAGES as readonly string[]).includes(stage), 'Unknown stage'); add('stage = ?', stage); }
  if (q.get('open') === 'true') where.push(`stage <> 'posted'`);
  if (from) { check(date.safeParse(from).success, 'from: expected YYYY-MM-DD'); add('due_at >= ?', toDueAt(from, '00:00')); }
  if (to) { check(date.safeParse(to).success, 'to: expected YYYY-MM-DD'); add('due_at < ?', toDueAt(addDays(to, 1), '00:00')); }

  return json(await rows(`select * from tasks ${where.length ? `where ${where.join(' and ')}` : ''} order by due_at limit 2000`, params));
});

export const POST = handler(async (req: Request) => {
  const c = await context();
  const input = await body(req, taskCreate);
  return json(await createTask(db(), { id: c.me.id, isLead: c.isLead }, input), 201);
});
