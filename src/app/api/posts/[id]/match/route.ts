import { z } from 'zod';
import { body, context, found, handler, HttpError, json, requireLead, type Params } from '@/lib/api';
import { db, row } from '@/lib/db';
import { attach } from '@/lib/matching';

/** Lead confirms or chooses the task this post delivers. Manual matches are never undone by automatic runs. */
export const POST = handler(async (req: Request, { params }: Params) => {
  const { id } = await params;
  const c = await context();
  requireLead(c);
  const { task_id } = await body(req, z.object({ task_id: z.string().uuid() }));
  const post = found(await row<{ client_id: string; status: string }>(`select client_id, status from ig_posts where id = $1 and deleted_at is null`, [id]), 'Post');
  const task = found(await row<{ client_id: string; post_id: string | null }>(`select client_id, post_id from tasks where id = $1`, [task_id]), 'Task');
  if (task.client_id !== post.client_id) throw new HttpError(400, 'That task belongs to another client');
  if (task.post_id && task.post_id !== id) throw new HttpError(409, 'That task already has a post. Unmatch it first.');
  await db().transaction(c.me.id, (tx) => attach(tx, task_id, id, 'manual', null, c.me.id));
  return json({ ok: true });
});
