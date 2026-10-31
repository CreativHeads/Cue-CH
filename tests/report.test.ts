import { describe, expect, it } from 'vitest';
import { buildReport, type ReportPost, type ReportTask } from '../src/lib/report';

let n = 0;
const task = (o: Partial<ReportTask>): ReportTask => ({
  id: String(++n), title: `Task ${n}`, client_id: 'd', client: 'Dentcom', owner_id: 'r', owner: 'Raheesha',
  stage: 'to_brief', delivery: null, due_at: '2026-11-02T12:30:00Z', content_type: 'poster', ...o,
});
const post = (o: Partial<ReportPost>): ReportPost => ({ client_id: 'd', client: 'Dentcom', status: 'matched', reach: 100, likes: 10, ...o });

describe('buildReport', () => {
  const today = '2026-11-05';
  const tasks = [
    task({ stage: 'posted', delivery: 'on_time', due_at: '2026-11-02T12:30:00Z' }),
    task({ stage: 'posted', delivery: 'late', due_at: '2026-11-03T12:30:00Z', owner_id: 's', owner: 'Sanjay' }),
    task({ stage: 'designing', due_at: '2026-11-04T12:30:00Z' }),            // overdue, not posted
    task({ stage: 'to_brief', due_at: '2026-11-07T12:30:00Z', owner_id: null, owner: null }), // still to come
  ];
  const posts = [post({}), post({ reach: 50, likes: 5 }), post({ status: 'extra', reach: 30, likes: 3 }),
    post({ client_id: 'x', client: 'Staxhaus', status: 'extra', reach: 7, likes: 1 })];
  const r = buildReport('2026-11-02', '2026-11-08', tasks, posts, today);

  it('totals planned, posted, missed, upcoming, extras, reach and likes', () => {
    expect(r.total).toMatchObject({ planned: 4, posted: 2, onTime: 1, late: 1, missed: 1, upcoming: 1, extra: 2, reach: 187, likes: 19 });
  });
  it('scores only what was already due: (1 on time + ½ late) ÷ 3 due', () => {
    expect(r.total.score).toBeCloseTo(50);
  });
  it('includes clients that only have posts', () => {
    expect(r.clients.map((c) => c.name)).toEqual(['Dentcom', 'Staxhaus']);
    expect(r.clients[1]).toMatchObject({ planned: 0, extra: 1, score: null });
  });
  it('breaks work down by designer, unassigned last', () => {
    expect(r.designers.map((d) => d.name)).toEqual(['Raheesha', 'Sanjay', 'Unassigned']);
    expect(r.designers[0]).toMatchObject({ assigned: 2, posted: 1, onTime: 1, missed: 1, inProgress: 1 });
  });
  it('lists the missed tasks', () => {
    expect(r.missedTasks).toHaveLength(1);
    expect(r.missedTasks[0]).toMatchObject({ stage: 'designing', owner: 'Raheesha' });
  });
});
