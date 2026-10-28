import type { z } from 'zod';
import { HttpError } from './errors';
import { istDate, istTime, toDueAt } from './dates';
import { row, rows, type Driver } from './db';
import type { markPosted, taskCreate, taskPatch } from './schemas';
import type { Task } from './types';

export interface Actor { id: string; isLead: boolean }

async function load(on: Driver, id: string) {
  const t = await row<Task>(`select * from tasks where id = $1`, [id], on);
  if (!t) throw new HttpError(404, 'Task not found');
  return t;
}
const mustOwn = (t: Task, a: Actor, msg = 'You can only edit your own tasks') => {
  if (!a.isLead && t.owner_id !== a.id) throw new HttpError(403, msg);
};

/** Manual task. Designers and editors can only create tasks for themselves. */
export async function createTask(on: Driver, a: Actor, input: z.infer<typeof taskCreate>) {
  const owner = a.isLead ? input.owner_id : a.id;
  return on.transaction(a.id, async (tx) => row<Task>(
    `insert into tasks (client_id, content_type, owner_id, stage, due_at, title, brief, priority)
     values ($1, $2, $3, $4, $5, $6, $7, $8) returning *`,
    [input.client_id, input.content_type, owner, input.stage, toDueAt(input.due_date, input.posting_time), input.title, input.brief ?? null, input.priority], tx));
}

/**
 * Update a task. Owners may change stage, title, brief and priority; only the lead/admin may change
 * owner, type, due date and flags. Leaving Posted detaches any matched post.
 */
export async function updateTask(on: Driver, a: Actor, id: string, input: z.infer<typeof taskPatch>) {
  const t = await load(on, id);
  mustOwn(t, a);
  const patch: Record<string, unknown> = {};
  for (const k of ['title', 'brief', 'priority'] as const) if (input[k] !== undefined) patch[k] = input[k];

  const dueAt = input.due_date || input.posting_time
    ? toDueAt(input.due_date ?? istDate(t.due_at), input.posting_time ?? istTime(t.due_at)) : undefined;
  const structural = {
    owner_id: input.owner_id !== undefined && input.owner_id !== t.owner_id,
    content_type: input.content_type !== undefined && input.content_type !== t.content_type,
    due_at: dueAt !== undefined && dueAt !== new Date(t.due_at).toISOString(),
    flags: input.flags !== undefined && input.flags.join() !== t.flags.join(),
  };
  if (!a.isLead && Object.values(structural).some(Boolean)) throw new HttpError(403, 'Only the lead can change owner, type, due date or flags');
  if (structural.owner_id) patch.owner_id = input.owner_id;
  if (structural.content_type) patch.content_type = input.content_type;
  if (structural.due_at) patch.due_at = dueAt;
  if (structural.flags) patch.flags = input.flags;

  if (input.stage && input.stage !== t.stage) {
    patch.stage = input.stage;
    if (input.stage === 'posted' && !t.post_id) Object.assign(patch, { delivery: 'manual_unverified', posted_at: new Date().toISOString() });
    if (t.stage === 'posted') Object.assign(patch, { posted_at: null, delivery: null, post_id: null, permalink: null });
  }

  return on.transaction(a.id, async (tx) => {
    if (patch.stage && t.stage === 'posted' && t.post_id) {
      // the post goes back to the review queue (Phase 2)
      await tx.query(`update post_matches set revoked_at = now() where task_id = $1 and revoked_at is null`, [id]);
      await tx.query(`update ig_posts set status = 'pending_review' where id = $1`, [t.post_id]);
    }
    const keys = Object.keys(patch);
    if (!keys.length) return t;
    return row<Task>(`update tasks set ${keys.map((k, i) => `${k} = $${i + 2}`).join(', ')} where id = $1 returning *`,
      [id, ...keys.map((k) => patch[k])], tx);
  });
}

/** Manual fallback: mark posted with an optional permalink (required except for stories). */
export async function markTaskPosted(on: Driver, a: Actor, id: string, input: z.infer<typeof markPosted>) {
  const t = await load(on, id);
  mustOwn(t, a, 'You can only mark your own tasks posted');
  if (t.stage === 'posted') throw new HttpError(409, 'Already posted');
  if (!input.permalink && t.content_type !== 'story') throw new HttpError(400, 'Paste the Instagram link (only stories can skip it)');
  return on.transaction(a.id, (tx) => row<Task>(
    `update tasks set stage = 'posted', delivery = 'manual_unverified', posted_at = now(), permalink = $2 where id = $1 returning *`,
    [id, input.permalink ?? null], tx));
}

export async function addNote(on: Driver, a: Actor, id: string, text: string) {
  await load(on, id);
  return row(`insert into task_events (task_id, actor_id, type, to_value) values ($1, $2, 'note', $3) returning *`, [id, a.id, text], on);
}

export async function deleteTask(on: Driver, a: Actor, id: string) {
  if (!a.isLead) throw new HttpError(403, 'Only the lead or admin can delete tasks');
  await rows(`delete from tasks where id = $1`, [id], on);
}
