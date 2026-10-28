import { context, handler, HttpError, json } from '@/lib/api';
import { rows } from '@/lib/db';
import { diffDays, istDate, monthDays, todayIST, toDueAt, ymAdd, ymOf } from '@/lib/dates';
import { month as monthSchema } from '@/lib/schemas';
import { deliveryScore, scoreParts, taskDot, type Dot } from '@/lib/score';
import type { Client, Task } from '@/lib/types';

interface Cell { dots: Dot[]; tasks: { id: string; title: string; type: string; stage: string; owner: string | null; dot: Dot }[]; extras: number }

// GET /api/dashboard?month=YYYY-MM → clients × days with cell states, month-to-date score and inactivity flag.
export const GET = handler(async (req: Request) => {
  await context();
  const today = todayIST();
  const month = new URL(req.url).searchParams.get('month') || ymOf(today);
  if (!monthSchema.safeParse(month).success) throw new HttpError(400, 'month: expected YYYY-MM');
  const from = toDueAt(`${month}-01`, '00:00');
  const to = toDueAt(`${ymAdd(month, 1)}-01`, '00:00');

  const clients = await rows<Client>(`select * from clients where status <> 'archived' order by name`);
  const tasks = await rows<Task>(
    `select id, client_id, title, content_type, stage, due_at, delivery, owner_id, posted_at from tasks where due_at >= $1 and due_at < $2`, [from, to]);
  const extras = await rows<{ client_id: string; posted_at: string }>(
    `select client_id, posted_at from ig_posts where status = 'extra' and posted_at >= $1 and posted_at < $2`, [from, to]);

  // inactivity: last post (seen on Instagram or marked by hand) vs. tasks expected since then
  const lookback = toDueAt(ymAdd(ymOf(today), -2) + '-01', '00:00');
  const recentPosts = await rows<{ client_id: string; posted_at: string }>(
    `select client_id, posted_at from ig_posts where status <> 'ignored' and posted_at >= $1`, [lookback]);
  const recentTasks = await rows<Pick<Task, 'client_id' | 'due_at' | 'stage' | 'posted_at'>>(
    `select client_id, due_at, stage, posted_at from tasks where due_at >= $1 and due_at < $2`, [lookback, toDueAt(today, '00:00')]);

  const days = monthDays(month);
  const isCurrent = month === ymOf(today);
  const result = clients.map((cl) => {
    const mine = tasks.filter((t) => t.client_id === cl.id);
    const myExtras = extras.filter((e) => e.client_id === cl.id);
    const cells: Record<string, Cell> = {};
    for (const d of days) cells[d] = { dots: [], tasks: [], extras: 0 };
    for (const t of mine) {
      const dot = taskDot(t, today);
      const cell = cells[istDate(t.due_at)];
      if (!cell) continue;
      cell.dots.push(dot);
      cell.tasks.push({ id: t.id, title: t.title, type: t.content_type, stage: t.stage, owner: t.owner_id, dot });
    }
    for (const e of myExtras) { const cell = cells[istDate(e.posted_at)]; if (cell) { cell.dots.push('extra'); cell.extras++; } }
    const parts = scoreParts(mine, myExtras.length, isCurrent ? today : undefined);

    const postDates = [
      ...recentPosts.filter((p) => p.client_id === cl.id).map((p) => istDate(p.posted_at)),
      ...recentTasks.filter((t) => t.client_id === cl.id && t.posted_at).map((t) => istDate(t.posted_at!)),
    ].filter((d) => d <= today).sort();
    const last = postDates[postDates.length - 1] ?? null;
    const quietDays = last ? diffDays(today, last) : null;
    const expected = recentTasks.filter((t) => t.client_id === cl.id && (!last || istDate(t.due_at) > last)).length;
    const inactive = cl.status === 'active' && expected > 0 && (quietDays == null || quietDays >= cl.inactivity_days)
      ? { days: quietDays, missed: recentTasks.filter((t) => t.client_id === cl.id && t.stage !== 'posted' && (!last || istDate(t.due_at) > last)).length }
      : null;

    return { client: cl, cells, score: deliveryScore(parts), parts, lastPost: last, inactive };
  });

  const monthTasks = tasks.length;
  const posted = tasks.filter((t) => t.stage === 'posted').length;
  const overdue = tasks.filter((t) => t.stage !== 'posted' && new Date(t.due_at) < new Date()).length;
  return json({ month, today, days, rows: result, totals: { planned: monthTasks, posted, overdue, inProgress: monthTasks - posted - overdue } });
});
