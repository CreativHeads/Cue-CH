import { context, handler, HttpError, json } from '@/lib/api';
import { rows } from '@/lib/db';

// GET /api/posts?status=pending_review|extra|resolved|all&client=  → posts with their suggested/matched task
export const GET = handler(async (req: Request) => {
  await context();
  const q = new URL(req.url).searchParams;
  const status = q.get('status') ?? 'pending_review';
  const where: string[] = ['p.deleted_at is null'];
  const params: unknown[] = [];
  if (status === 'resolved') where.push(`p.manual and p.status in ('matched','extra','ignored')`);
  else if (status !== 'all') {
    if (!['pending_review', 'extra', 'matched', 'ignored'].includes(status)) throw new HttpError(400, 'Unknown status');
    params.push(status); where.push(`p.status = $${params.length}`);
  }
  if (q.get('client')) { params.push(q.get('client')); where.push(`p.client_id = $${params.length}`); }
  return json(await rows(
    `select p.id, p.client_id, p.content_type, p.posted_at, p.permalink, p.thumbnail_url, p.caption, p.reach, p.likes, p.comments, p.saves,
            p.status, p.match_score, p.manual, p.is_story, p.relationship,
            coalesce(t.id, s.id) as task_id, coalesce(t.title, s.title) as task_title, coalesce(t.content_type, s.content_type) as task_type,
            coalesce(t.due_at, s.due_at) as task_due_at, coalesce(t.owner_id, s.owner_id) as task_owner
       from ig_posts p
       left join tasks s on s.id = p.suggested_task_id
       left join tasks t on t.post_id = p.id
      where ${where.join(' and ')} order by p.posted_at desc limit 300`, params));
});
