import { describe, expect, it } from 'vitest';
import { candidateDates, itemDates, planGeneration, type ExistingTask } from '@/lib/generation';
import { dow, istDate, istTime, toDueAt } from '@/lib/dates';
import type { PlanItem } from '@/lib/types';

const item = (p: Partial<PlanItem>): PlanItem => ({
  id: 'i1', plan_id: 'p1', content_type: 'reel', monthly_count: 8, frequency: { mode: 'spread' },
  owner_id: 'editor-x', posting_time: '19:00:00', label: null, sort: 0, ...p,
});

describe('frequency rules', () => {
  it('8 reels Tue/Fri in November 2026 land on exactly the Tuesdays and Fridays', () => {
    const { dates, warning } = itemDates(item({ frequency: { mode: 'weekdays', days: ['TUE', 'FRI'] } }), '2026-11');
    expect(warning).toBeNull();
    expect(dates).toEqual(['2026-11-03', '2026-11-06', '2026-11-10', '2026-11-13', '2026-11-17', '2026-11-20', '2026-11-24', '2026-11-27']);
    dates.forEach((d) => expect([2, 5]).toContain(dow(d)));
  });

  it('5 stories a week are prorated across partial weeks', () => {
    const dates = candidateDates({ mode: 'per_week', count: 5, days: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] }, 0, '2026-11');
    // Nov 2026 starts on a Sunday: week 1 has no allowed days; weeks 2–5 are full (5 each); Mon 30th = 1 of 6 days → round(5/6) = 1
    expect(dates.length).toBe(21);
    expect(dates.every((d) => dow(d) !== 0)).toBe(true);
    expect(new Set(dates).size).toBe(dates.length);
  });

  it('spread places the count evenly', () => {
    const dates = candidateDates({ mode: 'spread' }, 4, '2026-11');
    expect(dates).toEqual(['2026-11-04', '2026-11-12', '2026-11-19', '2026-11-27']);
  });

  it('fixed dates keep only dates in the month', () => {
    expect(candidateDates({ mode: 'dates', dates: ['2026-11-14', '2026-12-01', '2026-11-14'] }, 0, '2026-11')).toEqual(['2026-11-14']);
  });

  it('drops evenly when more weekdays than the count', () => {
    const { dates } = itemDates(item({ monthly_count: 4, frequency: { mode: 'weekdays', days: ['TUE', 'FRI'] } }), '2026-11');
    expect(dates).toHaveLength(4);
    expect(dates[0]).toBe('2026-11-03');
    expect(dates[3]).toBe('2026-11-27');
  });

  it('warns (never silently fails) when the rule cannot reach the count', () => {
    const { dates, warning } = itemDates(item({ monthly_count: 6, frequency: { mode: 'weekdays', days: ['TUE'] } }), '2026-11');
    expect(dates).toHaveLength(6);
    expect(warning).toMatch(/Only 4/);
  });
});

describe('IST due times', () => {
  it('stores 19:00 IST as 13:30 UTC and reads it back in IST', () => {
    const dueAt = toDueAt('2026-11-03', '19:00');
    expect(dueAt).toBe('2026-11-03T13:30:00.000Z');
    expect(istDate(dueAt)).toBe('2026-11-03');
    expect(istTime(dueAt)).toBe('19:00');
  });
  it('00:30 IST counts for that IST day', () => {
    expect(istDate(toDueAt('2026-11-04', '00:30'))).toBe('2026-11-04');
  });
});

describe('idempotent generation', () => {
  const reels = item({ frequency: { mode: 'weekdays', days: ['TUE', 'FRI'] } });
  const base = { clientId: 'c1', clientName: 'Malabar', month: '2026-11', items: [reels], today: '2026-10-28' };

  it('first run creates 8 tasks at 19:00 IST with the plan owner', () => {
    const r = planGeneration({ ...base, existing: [] });
    expect(r.creates).toHaveLength(8);
    expect(r.creates.every((t) => istTime(t.due_at) === '19:00' && t.owner_id === 'editor-x' && t.stage === 'to_brief')).toBe(true);
    expect(r.creates.map((t) => t.seq)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('re-running creates no duplicates and never moves in-progress work', () => {
    const first = planGeneration({ ...base, existing: [] });
    const existing: ExistingTask[] = first.creates.map((t, i) => ({
      id: `t${i + 1}`, plan_item_id: t.plan_item_id, seq: t.seq, stage: i === 0 ? 'designing' : 'to_brief',
      posted_at: null, due_at: t.due_at, owner_id: t.owner_id, content_type: t.content_type,
    }));
    const again = planGeneration({ ...base, existing });
    expect(again.creates).toHaveLength(0);
    expect(again.updates).toHaveLength(0);
    expect(again.deletes).toHaveLength(0);

    // change the posting time: only untouched tasks move; the one in Designing stays put
    const moved = planGeneration({ ...base, items: [{ ...reels, posting_time: '18:00' }], existing });
    expect(moved.updates).toHaveLength(7);
    expect(moved.updates.find((u) => u.id === 't1')).toBeUndefined();

    // shrink the count: only untouched future slots are removed
    const fewer = planGeneration({ ...base, items: [{ ...reels, monthly_count: 6 }], existing });
    expect(fewer.creates).toHaveLength(0);
    expect(fewer.deletes.length).toBeGreaterThan(0);
    expect(fewer.deletes).not.toContain('t1');
  });

  it('never touches past tasks', () => {
    const r = planGeneration({ ...base, existing: [], today: '2026-12-01' });
    const existing: ExistingTask[] = r.creates.map((t, i) => ({ id: `t${i}`, plan_item_id: t.plan_item_id, seq: t.seq, stage: 'to_brief', posted_at: null, due_at: t.due_at, owner_id: 'someone-else', content_type: t.content_type }));
    const again = planGeneration({ ...base, existing, today: '2026-12-01' });
    expect(again.updates).toHaveLength(0);
  });
});
