import { context, handler, HttpError, json } from '@/lib/api';
import { addDays, diffDays, todayIST, toDueAt } from '@/lib/dates';
import { rows } from '@/lib/db';
import { buildReport, type ReportPost, type ReportTask } from '@/lib/report';
import { date } from '@/lib/schemas';

// GET /api/reports?from=YYYY-MM-DD&to=YYYY-MM-DD → live delivery report for that IST range (inclusive)
export const GET = handler(async (req: Request) => {
  await context();
  const q = new URL(req.url).searchParams;
  const from = q.get('from') ?? '', to = q.get('to') ?? '';
  if (!date.safeParse(from).success || !date.safeParse(to).success) throw new HttpError(400, 'from and to: expected YYYY-MM-DD');
  if (diffDays(to, from) < 0 || diffDays(to, from) > 92) throw new HttpError(400, 'Pick a range of up to 3 months');
  const start = toDueAt(from, '00:00'), end = toDueAt(addDays(to, 1), '00:00');

  const tasks = await rows<ReportTask>(
    `select t.id, t.title, t.client_id, c.name as client, t.owner_id, s.name as owner, t.stage, t.delivery, t.due_at, t.content_type
       from tasks t join clients c on c.id = t.client_id left join staff s on s.id = t.owner_id
      where c.status <> 'archived' and t.due_at >= $1 and t.due_at < $2 order by t.due_at`, [start, end]);
  const posts = await rows<ReportPost>(
    `select p.client_id, c.name as client, p.status, p.reach, p.likes from ig_posts p join clients c on c.id = p.client_id
      where c.status <> 'archived' and p.deleted_at is null and p.status <> 'ignored' and p.posted_at >= $1 and p.posted_at < $2`, [start, end]);
  return json(buildReport(from, to, tasks, posts, todayIST()));
});
