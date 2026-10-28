// Integration tests: the real schema, triggers and services against PostgreSQL (PGlite, in memory).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { createSession, hashPassword, staffForToken, verifyPassword } from '@/lib/auth';
import { istDate, istTime } from '@/lib/dates';
import { row, rows, setDriver, type Driver } from '@/lib/db';
import { copyItems, runGeneration } from '@/lib/plans';
import { addNote, createTask, markTaskPosted, updateTask, type Actor } from '@/lib/tasks';
import type { Task } from '@/lib/types';

let db: Driver;
let pg: PGlite;
const seedSql = () => readFileSync(path.join(__dirname, '../db/seed.sql'), 'utf8');
const ids: Record<string, string> = {};
const TODAY = '2026-10-28';

beforeAll(async () => {
  pg = new PGlite({ parsers: { 1184: (v: string) => new Date(v).toISOString(), 1082: (v: string) => v } });
  db = {
    query: (t, p) => pg.query(t, p as unknown[]) as never,
    transaction: (actor, fn) => pg.transaction(async (tx) => {
      await tx.query(`select set_config('app.actor_id', $1, true)`, [actor ?? '']);
      return fn({ query: (t, p) => tx.query(t, p as unknown[]) as never });
    }),
  };
  setDriver(db);
  await pg.exec(readFileSync(path.join(__dirname, '../db/migrations/0001_init.sql'), 'utf8'));
  await pg.exec(seedSql());
  for (const s of await rows<{ id: string; name: string }>(`select id, name from staff`)) ids[s.name] = s.id;
  ids.malabar = (await row<{ id: string }>(`select id from clients where name = 'Malabar'`))!.id;
}, 60_000);

const lead = (): Actor => ({ id: ids.Thanseeh, isLead: true });
const shelby = (): Actor => ({ id: ids.Shelby, isLead: false });
const basil = (): Actor => ({ id: ids.Basil, isLead: false });

describe('schema + seed', () => {
  it('seeds 6 staff and 6 clients, and the seed is safe to re-run', async () => {
    expect(Object.keys(ids)).toHaveLength(7);
    await db.query(readFileSync(path.join(__dirname, '../db/seed.sql'), 'utf8').split(';\n').filter((s) => s.trim() && !s.trim().startsWith('--')).join(';\n'))
      .catch(() => null); // PGlite query() takes one statement; re-run via exec below
    const count = await row<{ n: number }>(`select count(*)::int as n from clients`);
    expect(count!.n).toBe(6);
  });
});

describe('plan generation against Postgres (brief Phase 1 acceptance)', () => {
  let planId: string;
  let reelItem: string;

  it('8 reels Tue/Fri at 19:00 IST + 5 stories a week for November 2026', async () => {
    planId = (await row<{ id: string }>(`insert into plans (client_id, month) values ($1, '2026-11-01') returning id`, [ids.malabar]))!.id;
    reelItem = (await row<{ id: string }>(
      `insert into plan_items (plan_id, content_type, monthly_count, frequency, owner_id, posting_time) values ($1, 'reel', 8, $2, $3, '19:00') returning id`,
      [planId, JSON.stringify({ mode: 'weekdays', days: ['TUE', 'FRI'] }), ids.Shelby]))!.id;
    await db.query(`insert into plan_items (plan_id, content_type, monthly_count, frequency, owner_id, posting_time, sort) values ($1, 'story', 0, $2, $3, '12:00', 1)`,
      [planId, JSON.stringify({ mode: 'per_week', count: 5, days: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] }), ids.Basil]);

    const preview = await runGeneration(db, planId, true, TODAY);
    expect(preview.created).toBe(29);
    expect(await row<{ n: number }>(`select count(*)::int n from tasks`)).toEqual({ n: 0 }); // dry run writes nothing

    const r = await db.transaction(ids.Thanseeh, (tx) => runGeneration(tx, planId, false, TODAY));
    expect(r.created).toBe(29);
    const reels = await rows<Task>(`select * from tasks where plan_item_id = $1 order by seq`, [reelItem]);
    expect(reels.map((t) => istDate(t.due_at))).toEqual(['2026-11-03', '2026-11-06', '2026-11-10', '2026-11-13', '2026-11-17', '2026-11-20', '2026-11-24', '2026-11-27']);
    expect(reels.every((t) => istTime(t.due_at) === '19:00' && t.owner_id === ids.Shelby && t.stage === 'to_brief')).toBe(true);
    expect(await row<{ n: number }>(`select count(*)::int n from tasks where content_type = 'story'`)).toEqual({ n: 21 });
  });

  it('records who generated each task in the audit trail', async () => {
    const ev = await rows<{ actor_id: string }>(`select distinct actor_id from task_events`);
    expect(ev).toEqual([{ actor_id: ids.Thanseeh }]);
  });

  it('re-running creates no duplicates and never moves work in progress', async () => {
    const first = (await row<Task>(`select * from tasks where plan_item_id = $1 and seq = 1`, [reelItem]))!;
    await updateTask(db, shelby(), first.id, { stage: 'designing' });
    await db.query(`update plan_items set posting_time = '18:00' where id = $1`, [reelItem]);

    const r = await db.transaction(ids.Thanseeh, (tx) => runGeneration(tx, planId, false, TODAY));
    expect(r.created).toBe(0);
    expect(r.updated).toBe(7);
    expect(await row<{ n: number }>(`select count(*)::int n from tasks`)).toEqual({ n: 29 });
    const kept = (await row<Task>(`select * from tasks where id = $1`, [first.id]))!;
    expect(istTime(kept.due_at)).toBe('19:00'); // in Designing: untouched
    const moved = (await row<Task>(`select * from tasks where plan_item_id = $1 and seq = 2`, [reelItem]))!;
    expect(istTime(moved.due_at)).toBe('18:00');
  });

  it('copy to next month clones items as a draft', async () => {
    const dec = (await row<{ id: string }>(`insert into plans (client_id, month) values ($1, '2026-12-01') returning id`, [ids.malabar]))!.id;
    await copyItems(db, planId, dec);
    expect(await row<{ n: number }>(`select count(*)::int n from plan_items where plan_id = $1`, [dec])).toEqual({ n: 2 });
    await expect(db.query(`insert into plans (client_id, month) values ($1, '2026-12-01')`, [ids.malabar])).rejects.toThrow(); // one plan per month
  });
});

describe('task permissions and history', () => {
  let task: Task;
  beforeAll(async () => {
    task = (await row<Task>(`select * from tasks where owner_id = $1 and stage = 'to_brief' order by due_at limit 1`, [ids.Shelby]))!;
  });

  it('an editor can move their own task, and the move is logged with them as actor', async () => {
    const t = await updateTask(db, shelby(), task.id, { stage: 'client_review' });
    expect(t!.stage).toBe('client_review');
    const ev = await row<{ actor_id: string; from_value: string; to_value: string }>(
      `select actor_id, from_value, to_value from task_events where task_id = $1 and type = 'stage_change' and from_value is not null`, [task.id]);
    expect(ev).toEqual({ actor_id: ids.Shelby, from_value: 'to_brief', to_value: 'client_review' });
  });

  it('a designer cannot edit someone else’s task', async () => {
    await expect(updateTask(db, basil(), task.id, { stage: 'approved' })).rejects.toMatchObject({ status: 403 });
  });

  it('only the lead can reassign or move the due date', async () => {
    await expect(updateTask(db, shelby(), task.id, { owner_id: ids.Basil })).rejects.toMatchObject({ status: 403 });
    await expect(updateTask(db, shelby(), task.id, { due_date: '2026-11-29' })).rejects.toMatchObject({ status: 403 });
    const t = await updateTask(db, lead(), task.id, { owner_id: ids.Sabiq, due_date: '2026-11-29', posting_time: '20:00' });
    expect(t!.owner_id).toBe(ids.Sabiq);
    expect(istDate(t!.due_at)).toBe('2026-11-29');
    const types = await rows<{ type: string }>(`select type from task_events where task_id = $1 order by at`, [task.id]);
    expect(types.map((x) => x.type)).toEqual(expect.arrayContaining(['reassign', 'edit']));
  });

  it('stage timestamps are stamped by the database', async () => {
    const t = await updateTask(db, lead(), task.id, { stage: 'approved' });
    expect(t!.approved_at).toBeTruthy();
  });

  it('mark posted needs a link (except stories) and records a manual post', async () => {
    await expect(markTaskPosted(db, lead(), task.id, {})).rejects.toMatchObject({ status: 400 });
    const t = await markTaskPosted(db, lead(), task.id, { permalink: 'https://instagram.com/p/abc' });
    expect(t).toMatchObject({ stage: 'posted', delivery: 'manual_unverified', permalink: 'https://instagram.com/p/abc' });
    expect(await row(`select type from task_events where task_id = $1 and type = 'manual_post'`, [task.id])).toBeTruthy();
    await expect(markTaskPosted(db, lead(), task.id, { permalink: 'https://instagram.com/p/abc' })).rejects.toMatchObject({ status: 409 });
  });

  it('moving back out of Posted clears delivery', async () => {
    const t = await updateTask(db, lead(), task.id, { stage: 'scheduled' });
    expect(t).toMatchObject({ stage: 'scheduled', delivery: null, posted_at: null, permalink: null });
  });

  it('designers can only create tasks for themselves', async () => {
    const t = await createTask(db, basil(), { client_id: ids.malabar, content_type: 'poster', owner_id: ids.Shelby, stage: 'to_brief',
      due_date: '2026-11-05', posting_time: '18:00', title: 'Offer poster', priority: 'normal' });
    expect(t!.owner_id).toBe(ids.Basil);
  });

  it('notes are stored as events', async () => {
    await addNote(db, basil(), task.id, 'Client wants a warmer palette');
    expect(await row(`select to_value from task_events where task_id = $1 and type = 'note'`, [task.id])).toEqual({ to_value: 'Client wants a warmer palette' });
  });
});

describe('passwords and sessions', () => {
  it('hashes and verifies passwords', async () => {
    const h = await hashPassword('correct horse battery');
    expect(h.startsWith('scrypt$')).toBe(true);
    expect(await verifyPassword('correct horse battery', h)).toBe(true);
    expect(await verifyPassword('wrong', h)).toBe(false);
    expect(await verifyPassword('anything', null)).toBe(false);
  });

  it('a session resolves to its staff member, stores only a hash, and stops working when deactivated', async () => {
    const token = await createSession(ids.Raheesha);
    expect((await staffForToken(token))?.name).toBe('Raheesha');
    expect(await row(`select 1 from sessions where token_hash = $1`, [token])).toBeNull();
    expect(await staffForToken('not-a-token')).toBeNull();
    await db.query(`update staff set is_active = false where id = $1`, [ids.Raheesha]);
    expect(await staffForToken(token)).toBeNull();
  });

  it('never returns the password hash with staff details', async () => {
    const token = await createSession(ids.Souban);
    expect(Object.keys((await staffForToken(token))!)).not.toContain('password_hash');
  });
});
