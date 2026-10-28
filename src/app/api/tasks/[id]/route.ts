import { body, context, found, handler, json, type Params } from '@/lib/api';
import { db, row, rows } from '@/lib/db';
import { taskPatch } from '@/lib/schemas';
import { deleteTask, updateTask } from '@/lib/tasks';
import type { Task } from '@/lib/types';

export const GET = handler(async (_req: Request, { params }: Params) => {
  const { id } = await params;
  await context();
  const task = found(await row<Task>(`select * from tasks where id = $1`, [id]), 'Task');
  const events = await rows(`select * from task_events where task_id = $1 order by at`, [id]);
  const post = task.post_id ? await row(`select * from ig_posts where id = $1`, [task.post_id]) : null;
  return json({ task, events, post });
});

export const PATCH = handler(async (req: Request, { params }: Params) => {
  const { id } = await params;
  const c = await context();
  return json(await updateTask(db(), { id: c.me.id, isLead: c.isLead }, id, await body(req, taskPatch)));
});

export const DELETE = handler(async (_req: Request, { params }: Params) => {
  const { id } = await params;
  const c = await context();
  await deleteTask(db(), { id: c.me.id, isLead: c.isLead }, id);
  return json({ ok: true });
});
