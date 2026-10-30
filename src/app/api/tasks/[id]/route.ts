import { body, context, found, handler, json, requireNotViewer, type Params } from '@/lib/api';
import { db, row, rows } from '@/lib/db';
import { taskPatch } from '@/lib/schemas';
import { deleteTask, updateTask } from '@/lib/tasks';
import { notifyAssignment } from '@/lib/telegram';
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
  requireNotViewer(c);
  const old = await row<{ owner_id: string | null }>(`select owner_id from tasks where id = $1`, [id]);
  const input = await body(req, taskPatch);
  const updated = await updateTask(db(), { id: c.me.id, isLead: c.isLead, isViewer: c.isViewer }, id, input);
  if (input.owner_id && input.owner_id !== old?.owner_id && input.owner_id !== c.me.id) {
    notifyAssignment(db(), id, c.me.id, input.owner_id).catch(() => null);
  }
  return json(updated);
});

export const DELETE = handler(async (_req: Request, { params }: Params) => {
  const { id } = await params;
  const c = await context();
  requireNotViewer(c);
  await deleteTask(db(), { id: c.me.id, isLead: c.isLead, isViewer: c.isViewer }, id);
  return json({ ok: true });
});
