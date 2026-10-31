// Live delivery report for any IST date range (daily, weekly, monthly), using the month-end score rules.
import { istDate } from './dates';
import { deliveryScore, scoreParts } from './score';
import type { ContentType, Stage, Task } from './types';

export interface ReportTask {
  id: string; title: string; client_id: string; client: string; owner_id: string | null; owner: string | null;
  stage: Stage; delivery: Task['delivery']; due_at: string; content_type: ContentType;
}
export interface ReportPost { client_id: string; client: string; status: string; reach: number | null; likes: number | null }

export interface Line {
  planned: number; posted: number; onTime: number; late: number; manual: number; missed: number; upcoming: number;
  extra: number; score: number | null; reach: number; likes: number;
}
export interface DesignerLine { owner_id: string | null; name: string; assigned: number; posted: number; onTime: number; late: number; missed: number; inProgress: number }
export interface Report {
  from: string; to: string; total: Line;
  clients: (Line & { client_id: string; name: string })[];
  designers: DesignerLine[];
  missedTasks: { id: string; title: string; client: string; owner: string | null; due_at: string; stage: Stage }[];
}

function line(tasks: ReportTask[], posts: ReportPost[], today: string): Line {
  const extra = posts.filter((p) => p.status === 'extra').length;
  // score counts what's already due (before today, plus today's posted), like the month-to-date score
  const p = scoreParts(tasks, extra, today);
  return {
    planned: tasks.length,
    posted: tasks.filter((t) => t.stage === 'posted').length,
    onTime: p.onTime, late: p.late, manual: p.manual,
    missed: tasks.filter((t) => t.stage !== 'posted' && istDate(t.due_at) < today).length,
    upcoming: tasks.filter((t) => t.stage !== 'posted' && istDate(t.due_at) >= today).length,
    extra, score: deliveryScore(p),
    reach: posts.reduce((a, x) => a + (x.reach ?? 0), 0),
    likes: posts.reduce((a, x) => a + (x.likes ?? 0), 0),
  };
}

export function buildReport(from: string, to: string, tasks: ReportTask[], posts: ReportPost[], today: string): Report {
  const clientIds = [...new Set([...tasks.map((t) => t.client_id), ...posts.map((p) => p.client_id)])];
  const clientName = (id: string) => tasks.find((t) => t.client_id === id)?.client ?? posts.find((p) => p.client_id === id)?.client ?? '';
  const clients = clientIds
    .map((id) => ({ client_id: id, name: clientName(id), ...line(tasks.filter((t) => t.client_id === id), posts.filter((p) => p.client_id === id), today) }))
    .filter((c) => c.name)
    .sort((a, b) => a.name.localeCompare(b.name));

  const owners = [...new Set(tasks.map((t) => t.owner_id))];
  const designers = owners.map((id) => {
    const mine = tasks.filter((t) => t.owner_id === id);
    return {
      owner_id: id, name: id ? mine[0].owner ?? 'Former teammate' : 'Unassigned', assigned: mine.length,
      posted: mine.filter((t) => t.stage === 'posted').length,
      onTime: mine.filter((t) => t.delivery === 'on_time').length,
      late: mine.filter((t) => t.delivery === 'late').length,
      missed: mine.filter((t) => t.stage !== 'posted' && istDate(t.due_at) < today).length,
      inProgress: mine.filter((t) => ['designing', 'client_review', 'approved', 'scheduled'].includes(t.stage)).length,
    };
  }).sort((a, b) => (a.owner_id === null ? 1 : b.owner_id === null ? -1 : a.name.localeCompare(b.name)));

  const missedTasks = tasks.filter((t) => t.stage !== 'posted' && istDate(t.due_at) < today)
    .sort((a, b) => a.due_at.localeCompare(b.due_at)).slice(0, 50)
    .map((t) => ({ id: t.id, title: t.title, client: t.client, owner: t.owner, due_at: t.due_at, stage: t.stage }));

  return { from, to, total: line(tasks, posts, today), clients, designers, missedTasks };
}
