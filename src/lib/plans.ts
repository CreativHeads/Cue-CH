import { HttpError } from './errors';
import { row, rows, type Db } from './db';
import { todayIST } from './dates';
import { planGeneration, type ExistingTask } from './generation';
import type { Client, Plan, PlanItem } from './types';

export async function loadPlan(on: Db, id: string) {
  const plan = await row<Plan>(`select * from plans where id = $1`, [id], on);
  if (!plan) throw new HttpError(404, 'Plan not found');
  const items = await rows<PlanItem>(`select * from plan_items where plan_id = $1 order by sort, created_at`, [id], on);
  const client = (await row<Client>(`select * from clients where id = $1`, [plan.client_id], on))!;
  return { plan, items, client };
}

/** Preview (dryRun) or apply generation for a plan. Idempotent: upserts on (plan_item_id, seq). */
export async function runGeneration(on: Db, planId: string, dryRun: boolean, today = todayIST()) {
  const { plan, items, client } = await loadPlan(on, planId);
  const month = plan.month.slice(0, 7);
  const existing = items.length ? await rows<ExistingTask>(
    `select t.id, t.plan_item_id, t.seq, t.stage, t.posted_at, t.due_at, t.owner_id, t.content_type,
            exists (select 1 from task_events e where e.task_id = t.id and e.type = 'note') as has_notes
       from tasks t where t.plan_item_id = any($1::uuid[])`, [items.map((i) => i.id)], on) : [];
  const r = planGeneration({ clientId: client.id, clientName: client.name, month, items, existing, today });

  if (!dryRun) {
    for (const t of r.creates) {
      await on.query(
        `insert into tasks (client_id, plan_item_id, seq, content_type, due_at, owner_id, stage, title, brief)
         values ($1, $2, $3, $4, $5, $6, 'to_brief', $7, $8) on conflict (plan_item_id, seq) do nothing`,
        [t.client_id, t.plan_item_id, t.seq, t.content_type, t.due_at, t.owner_id, t.title, t.brief]);
    }
    for (const u of r.updates) {
      await on.query(`update tasks set due_at = $2, owner_id = $3, content_type = $4 where id = $1 and stage = 'to_brief'`,
        [u.id, u.patch.due_at, u.patch.owner_id, u.patch.content_type]);
    }
    if (r.deletes.length) await on.query(`delete from tasks where id = any($1::uuid[]) and stage = 'to_brief'`, [r.deletes]);
  }
  return { created: r.creates.length, updated: r.updates.length, deleted: r.deletes.length, kept: r.kept, warnings: r.warnings, preview: r.preview };
}

/** Copy a plan's items into another plan. Fixed dates are cleared (they belong to the old month). */
export async function copyItems(on: Db, fromPlanId: string, toPlanId: string) {
  await on.query(
    `insert into plan_items (plan_id, content_type, monthly_count, frequency, owner_id, posting_time, label, sort)
     select $2, content_type, monthly_count,
            case when frequency->>'mode' = 'dates' then '{"mode":"dates","dates":[]}'::jsonb else frequency end,
            owner_id, posting_time, label, sort
       from plan_items where plan_id = $1`, [fromPlanId, toPlanId]);
}
