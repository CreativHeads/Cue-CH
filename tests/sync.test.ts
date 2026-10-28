// Phases 2, 3 and 5 against PostgreSQL (PGlite), with Instagram and Telegram faked.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { assertClientSafe, bannedTermsIn } from '@/lib/copyGuard';
import { toDueAt } from '@/lib/dates';
import { row, rows, setDriver, type Driver } from '@/lib/db';
import { normaliseType, upsertPosts, type RawRow } from '@/lib/instagram';
import { computeMonthScores, runJob } from '@/lib/jobs';
import { attach, matchClient, revertDeleted } from '@/lib/matching';
import { getSettings, inQuietHours, notify } from '@/lib/telegram';

let db: Driver;
let pg: PGlite;
const ids: Record<string, string> = {};
let client: string;

const sent: { chat_id: unknown; text: string; reply_markup?: unknown }[] = [];
const fakeTelegram: typeof fetch = async (_url, init) => {
  const body = JSON.parse(String(init?.body));
  sent.push(body);
  return new Response(JSON.stringify({ ok: true, result: { message_id: sent.length } }));
};

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
  for (const f of ['0001_init.sql', '0002_sync_reminders.sql']) await pg.exec(readFileSync(path.join(__dirname, '../db/migrations', f), 'utf8'));
  await pg.exec(readFileSync(path.join(__dirname, '../db/seed.sql'), 'utf8'));
  for (const s of await rows<{ id: string; name: string }>(`select id, name from staff`)) ids[s.name] = s.id;
  client = (await row<{ id: string }>(`update clients set windsor_account_id = 'acc-malabar' where ig_username = 'malabar' returning id`))!.id;
  process.env.TELEGRAM_BOT_TOKEN = 'test-token';
  process.env.WINDSOR_API_KEY = 'test-key';
}, 60_000);

beforeEach(() => { sent.length = 0; });

async function task(type: string, due: string, time = '19:00', stage = 'scheduled', owner = 'Shelby', title = `${type} ${due}`) {
  return (await row<{ id: string }>(
    `insert into tasks (client_id, content_type, due_at, owner_id, stage, title) values ($1, $2, $3, $4, $5, $6) returning id`,
    [client, type, toDueAt(due, time), ids[owner], stage, title]))!.id;
}
const post = (id: string, mediaType: string, product: string, istStamp: string, extra: RawRow = {}): RawRow => ({
  account_id: 'acc-malabar', media_id: id, media_type: mediaType, media_product_type: product, timestamp: new Date(istStamp + '+05:30').toISOString(),
  media_permalink: `https://www.instagram.com/p/${id}/`, media_shortcode: id, media_reach: 1200, media_like_count: 80, media_comments_count: 5, ...extra,
});
const taskRow = (id: string) => row<{ stage: string; delivery: string | null; flags: string[]; post_id: string | null; permalink: string | null }>(`select * from tasks where id = $1`, [id]);
const postRow = (mediaId: string) => row<{ id: string; status: string; suggested_task_id: string | null; deleted_at: string | null }>(`select * from ig_posts where ig_media_id = $1`, [mediaId]);

describe('Instagram type normalisation (§5.1)', () => {
  it('maps media and product types', () => {
    expect(normaliseType('IMAGE', 'STORY')).toBe('story');
    expect(normaliseType('REEL', 'FEED')).toBe('reel');
    expect(normaliseType('VIDEO', 'REELS')).toBe('reel');
    expect(normaliseType('CAROUSEL_ALBUM', 'FEED')).toBe('carousel');
    expect(normaliseType('IMAGE', 'FEED')).toBe('poster');
    expect(normaliseType('VIDEO', 'FEED')).toBe('video');
    expect(normaliseType('IMAGE', 'AD')).toBeNull();
  });
});

describe('matching (§5.2, Phase 2 acceptance)', () => {
  it('a reel posted on its due day auto-matches with link and metrics', async () => {
    const t = await task('reel', '2026-11-03');
    await upsertPosts(db, [post('reel1', 'VIDEO', 'REELS', '2026-11-03T19:05:00')], { stories: false });
    const s = await matchClient(db, client);
    expect(s.matched).toBe(1);
    const tr = (await taskRow(t))!;
    expect(tr).toMatchObject({ stage: 'posted', delivery: 'on_time', permalink: 'https://www.instagram.com/p/reel1/' });
    expect((await row<{ reach: number }>(`select reach from ig_posts where id = $1`, [tr.post_id]))!.reach).toBe(1200);
  });

  it('a carousel against a poster task goes to review as a suggestion, and confirming adds swapped_type', async () => {
    const t = await task('poster', '2026-11-05', '18:00');
    await upsertPosts(db, [post('car1', 'CAROUSEL_ALBUM', 'FEED', '2026-11-05T18:10:00')], { stories: false });
    await matchClient(db, client);
    const p = (await postRow('car1'))!;
    expect(p).toMatchObject({ status: 'pending_review', suggested_task_id: t });
    await db.transaction(ids.Thanseeh, (tx) => attach(tx, t, p.id, 'manual', null, ids.Thanseeh));
    expect((await taskRow(t))!.flags).toContain('swapped_type');
  });

  it('an unplanned post becomes extra', async () => {
    await upsertPosts(db, [post('extra1', 'IMAGE', 'FEED', '2026-11-20T12:00:00')], { stories: false });
    await matchClient(db, client);
    expect((await postRow('extra1'))!.status).toBe('extra');
  });

  it('a post 2 days late matches as late', async () => {
    const t = await task('poster', '2026-11-10', '18:00');
    await upsertPosts(db, [post('late1', 'IMAGE', 'FEED', '2026-11-12T11:00:00')], { stories: false });
    await matchClient(db, client);
    const tr = (await taskRow(t))!;
    expect(tr).toMatchObject({ stage: 'posted', delivery: 'late' });
    expect(tr.flags).toContain('late');
  });

  it('a post 5 days late still finds its task (late window is 7 days)', async () => {
    const t = await task('carousel', '2026-11-01', '17:00');
    await upsertPosts(db, [post('late5', 'CAROUSEL_ALBUM', 'FEED', '2026-11-06T17:00:00')], { stories: false });
    await matchClient(db, client);
    const p = (await postRow('late5'))!;
    // 100 - 8*5 = 60: suggested for review rather than auto-matched, but found
    expect(p).toMatchObject({ status: 'pending_review', suggested_task_id: t });
  });

  it('a reel never auto-matches a poster task', async () => {
    const t = await task('poster', '2026-11-14', '18:00');
    await upsertPosts(db, [post('reel-vs-poster', 'REEL', 'FEED', '2026-11-14T18:00:00')], { stories: false });
    await matchClient(db, client);
    expect((await taskRow(t))!.stage).not.toBe('posted');
    expect((await postRow('reel-vs-poster'))!.status).toBe('extra');
  });

  it('re-running is idempotent and manual decisions survive automatic runs', async () => {
    const before = await row<{ n: number; m: number }>(`select (select count(*) from ig_posts)::int n, (select count(*) from post_matches where revoked_at is null)::int m`);
    await upsertPosts(db, [post('reel1', 'VIDEO', 'REELS', '2026-11-03T19:05:00')], { stories: false });
    await matchClient(db, client);
    await db.query(`update ig_posts set status = 'extra', manual = true where ig_media_id = 'extra1'`);
    await task('poster', '2026-11-20', '12:00'); // a task that would now fit extra1
    await matchClient(db, client);
    expect(await row(`select (select count(*) from ig_posts)::int n, (select count(*) from post_matches where revoked_at is null)::int m`)).toEqual(before);
    expect((await postRow('extra1'))!.status).toBe('extra');
  });

  it('a hand-marked task is verified when its post arrives', async () => {
    const t = await task('carousel', '2026-11-18', '17:00');
    await db.query(`update tasks set stage = 'posted', delivery = 'manual_unverified', permalink = 'https://www.instagram.com/p/hand1' where id = $1`, [t]);
    await upsertPosts(db, [post('hand1', 'CAROUSEL_ALBUM', 'FEED', '2026-11-18T17:30:00')], { stories: false });
    const s = await matchClient(db, client);
    expect(s.verified).toBe(1);
    expect((await taskRow(t))!.delivery).toBe('on_time');
  });

  it('an empty Instagram response never marks posts deleted', async () => {
    const lookback = toDueAt('2026-11-01', '00:00');
    for (let i = 0; i < 3; i++) expect((await upsertPosts(db, [], { stories: false, lookbackFrom: lookback })).deletedPosts).toHaveLength(0);
    expect(await row<{ n: number }>(`select count(*)::int n from ig_posts where deleted_at is not null or missed_syncs > 0`)).toEqual({ n: 0 });
  });

  it('a deleted post is detected within two runs and its task reverts with the deleted flag', async () => {
    const t = await task('reel', '2026-11-24');
    const lookback = toDueAt('2026-11-01', '00:00');
    await upsertPosts(db, [post('del1', 'REEL', 'FEED', '2026-11-24T19:00:00')], { stories: false, lookbackFrom: lookback });
    await matchClient(db, client);
    expect((await taskRow(t))!.stage).toBe('posted');
    const others = (await rows<{ ig_media_id: string }>(`select ig_media_id from ig_posts where not is_story and ig_media_id <> 'del1'`)).map((r) => r.ig_media_id);
    const keep = others.map((id) => post(id, 'IMAGE', 'FEED', '2026-11-03T19:05:00'));
    const r1 = await upsertPosts(db, keep, { stories: false, lookbackFrom: lookback });
    expect(r1.deletedPosts).toHaveLength(0); // one miss is not enough
    const r2 = await upsertPosts(db, keep, { stories: false, lookbackFrom: lookback });
    expect(r2.deletedPosts.map((p) => p.id)).toEqual([(await postRow('del1'))!.id]);
    await revertDeleted(db, r2.deletedPosts.map((p) => p.id));
    const tr = (await taskRow(t))!;
    expect(tr).toMatchObject({ stage: 'scheduled', post_id: null });
    expect(tr.flags).toContain('deleted');
  });
});

describe('stories (Phase 5)', () => {
  it('frames within 10 minutes are one story; surplus fills an earlier unfilled story task (late); then extra', async () => {
    const mon = await task('story', '2026-11-23', '12:00', 'scheduled', 'Basil');
    const wed = await task('story', '2026-11-25', '12:00', 'scheduled', 'Basil');
    await upsertPosts(db, [
      { account_id: 'acc-malabar', story_id: 's1', story_timestamp: new Date('2026-11-25T10:00:00+05:30').toISOString() },
      { account_id: 'acc-malabar', story_id: 's2', story_timestamp: new Date('2026-11-25T10:06:00+05:30').toISOString() },
      { account_id: 'acc-malabar', story_id: 's3', story_timestamp: new Date('2026-11-25T15:00:00+05:30').toISOString() },
      { account_id: 'acc-malabar', story_id: 's4', story_timestamp: new Date('2026-11-25T20:00:00+05:30').toISOString() },
    ], { stories: true });
    await matchClient(db, client);
    expect((await taskRow(wed))!).toMatchObject({ stage: 'posted', delivery: 'on_time' });
    expect((await taskRow(mon))!).toMatchObject({ stage: 'posted', delivery: 'late' });
    expect((await postRow('s2'))!.status).toBe('matched'); // second frame of the first story
    expect((await postRow('s4'))!.status).toBe('extra');
  });
});

describe('month-end score (Phase 5)', () => {
  it('provisional then final, matching the formula, and the plan closes on final', async () => {
    await db.query(`insert into plans (client_id, month, status) values ($1, '2026-11-01', 'active')`, [client]);
    const scores = await computeMonthScores(db, '2026-11', false);
    const s = (await row<{ planned: number; on_time: number; late: number; missed: number; score: string; is_final: boolean }>(
      `select * from monthly_scores where client_id = $1 and month = '2026-11-01'`, [client]))!;
    const expected = Math.min(100, ((s.on_time + 0.5 * s.late) / s.planned) * 100);
    expect(Number(s.score)).toBeCloseTo(Math.round(expected * 10) / 10, 1);
    expect(s.is_final).toBe(false);
    expect(scores.length).toBeGreaterThan(0);
    await computeMonthScores(db, '2026-11', true);
    expect((await row(`select is_final from monthly_scores where client_id = $1`, [client]))).toEqual({ is_final: true });
    expect((await row(`select status from plans where client_id = $1 and month = '2026-11-01'`, [client]))).toEqual({ status: 'closed' });
  });
});

describe('copy guard (§9.1)', () => {
  it('blocks internal tool names as whole words, case-insensitively', () => {
    for (const t of ['Data from Windsor.ai', 'the API failed', 'SYNC finished', 'cron ran', 'Supabase row', 'via webhook', 'GPT summary'])
      expect(() => assertClientSafe(t)).toThrow();
    for (const t of ['Your rapid growth continues', 'Weekly report is ready', 'Synchronised swimming', 'capital'])
      expect(bannedTermsIn(t)).toEqual([]);
    expect(bannedTermsIn('our dashboard', ['dashboard'])).toEqual(['dashboard']);
  });
});

describe('Telegram reminders (Phase 3 acceptance)', () => {
  beforeAll(async () => {
    await db.query(`update staff set telegram_chat_id = 1000 + (select count(*) from staff s2 where s2.created_at < staff.created_at or (s2.created_at = staff.created_at and s2.id < staff.id))`);
  });

  it('quiet hours wrap past midnight', () => {
    expect(inQuietHours('23:30', '22:00', '08:00')).toBe(true);
    expect(inQuietHours('07:59', '22:00', '08:00')).toBe(true);
    expect(inQuietHours('08:00', '22:00', '08:00')).toBe(false);
    expect(inQuietHours('13:00', '12:00', '14:00')).toBe(true);
  });

  it('a task due at 19:00 still in Designing at 17:00 triggers exactly one nudge; an approved task triggers none', async () => {
    const designing = await task('reel', '2026-12-02', '19:00', 'designing', 'Shelby', 'Nudge me');
    const approved = await task('reel', '2026-12-02', '19:30', 'approved', 'Shelby', 'Already approved');
    const at = new Date('2026-12-02T17:00:00+05:30');
    await runJob('reminders', { now: at, fetcher: fakeTelegram, driver: db });
    await runJob('reminders', { now: new Date('2026-12-02T17:15:00+05:30'), fetcher: fakeTelegram, driver: db });
    const nudges = await rows<{ staff_id: string; task_id: string }>(`select staff_id, task_id from notifications where kind = 'nudge_2h'`);
    expect(nudges.filter((n) => n.task_id === designing && n.staff_id === ids.Shelby)).toHaveLength(1);
    expect(nudges.filter((n) => n.task_id === approved)).toHaveLength(0);
    const msg = sent.find((m) => m.text.includes('Nudge me') || m.text.includes('due at 7:00 PM'));
    expect(JSON.stringify(msg?.reply_markup)).toContain(`stg:${designing}:approved`);
  });

  it('overdue alerts reach the owner and the lead, at most once per task per day', async () => {
    const t = await task('poster', '2026-12-03', '18:00', 'client_review', 'Basil', 'Late poster');
    const day = (h: string) => new Date(`2026-12-03T${h}:00+05:30`);
    await runJob('reminders', { now: day('19:00'), fetcher: fakeTelegram, driver: db });
    await runJob('reminders', { now: day('19:15'), fetcher: fakeTelegram, driver: db });
    const rowsFor = await rows<{ staff_id: string }>(`select staff_id from notifications where kind = 'overdue' and task_id = $1`, [t]);
    expect(rowsFor.map((r) => r.staff_id).sort()).toEqual([ids.Basil, ids.Thanseeh].sort());
    await runJob('reminders', { now: new Date('2026-12-04T09:00:00+05:30'), fetcher: fakeTelegram, driver: db });
    expect((await rows(`select 1 from notifications where kind = 'overdue' and task_id = $1`, [t])).length).toBe(4); // next day: once more each
  });

  it('non-urgent messages wait for quiet hours to end', async () => {
    const t = await task('poster', '2026-12-05', '18:00', 'designing', 'Basil', 'Night task');
    const r = await runJob('reminders', { now: new Date('2026-12-05T23:00:00+05:30'), fetcher: fakeTelegram, driver: db });
    expect((r as { stats: Record<string, number> }).stats.held).toBeGreaterThan(0);
    expect(await rows(`select 1 from notifications where task_id = $1`, [t])).toHaveLength(0);
    await runJob('reminders', { now: new Date('2026-12-06T08:00:00+05:30'), fetcher: fakeTelegram, driver: db });
    expect((await rows(`select 1 from notifications where task_id = $1`, [t])).length).toBeGreaterThan(0);
  });

  it('each linked person gets one digest a day listing today, overdue and waiting-on-client', async () => {
    const at = new Date('2026-12-03T09:00:00+05:30');
    await runJob('digest', { now: at, fetcher: fakeTelegram, driver: db });
    await runJob('digest', { now: at, fetcher: fakeTelegram, driver: db });
    const digests = await rows<{ staff_id: string; text: string }>(`select staff_id, text from notifications where kind = 'digest' and dedupe_key like '%2026-12-03'`);
    expect(digests).toHaveLength(6);
    const basil = digests.find((d) => d.staff_id === ids.Basil)!.text;
    expect(basil).toMatch(/Good morning Basil/);
    expect(basil).toMatch(/Waiting on client/);
  });

  it('a quiet client raises one red flag per day for the lead and admin', async () => {
    await db.query(`delete from tasks where client_id = $1 and due_at >= $2`, [client, toDueAt('2026-12-07', '00:00')]);
    await task('poster', '2026-12-08', '18:00', 'designing', 'Basil');
    const at = new Date('2026-12-11T10:00:00+05:30');
    await runJob('inactivity', { now: at, fetcher: fakeTelegram, driver: db });
    await runJob('inactivity', { now: at, fetcher: fakeTelegram, driver: db });
    const flags = await rows<{ staff_id: string; text: string }>(`select staff_id, text from notifications where kind = 'inactivity' and client_id = $1`, [client]);
    expect(flags.map((f) => f.staff_id).sort()).toEqual([ids.Souban, ids.Thanseeh].sort());
    expect(flags[0].text).toMatch(/Malabar.*no posts for \d+ days/);
  });

  it('no message can contain a banned term: blocked and logged, never sent', async () => {
    const s = await getSettings(db);
    const r = await notify(db, { staffId: ids.Shelby, kind: 'test', dedupeKey: 'guard-test', text: 'Posted via the Windsor sync' }, s, { fetcher: fakeTelegram, now: new Date('2026-12-03T12:00:00+05:30') });
    expect(r).toBe('blocked');
    expect(sent).toHaveLength(0);
    expect((await row<{ error: string }>(`select error from notifications where dedupe_key = 'guard-test'`))!.error).toMatch(/copy guard/);
    // and nothing the jobs actually sent contains one
    const all = await rows<{ text: string }>(`select text from notifications where error is null`);
    expect(all.length).toBeGreaterThan(0);
    for (const n of all) expect(bannedTermsIn(n.text)).toEqual([]);
  });

  it('people without Telegram are logged as not receiving reminders', async () => {
    await db.query(`update staff set telegram_chat_id = null where id = $1`, [ids.Sabiq]);
    const s = await getSettings(db);
    expect(await notify(db, { staffId: ids.Sabiq, kind: 'test', dedupeKey: 'unlinked', text: 'Hello' }, s, { fetcher: fakeTelegram, now: new Date('2026-12-03T12:00:00+05:30') })).toBe('not_linked');
  });
});

describe('scheduled jobs', () => {
  it('carry-over flags last week’s unposted tasks high priority, once', async () => {
    const t = await task('reel', '2026-12-09', '19:00', 'designing');
    const monday = new Date('2026-12-14T00:15:00+05:30');
    await runJob('carry-over', { now: monday, driver: db });
    expect(await row(`select priority, carried_over_from from tasks where id = $1`, [t])).toEqual({ priority: 'high', carried_over_from: '2026-12-07' });
    const again = await runJob('carry-over', { now: monday, driver: db });
    expect((again as unknown as { stats: { carried: number } }).stats.carried).toBe(0);
  });

  it('every job run is recorded', async () => {
    const r = await rows<{ job: string; status: string }>(`select distinct job, status from sync_runs`);
    expect(r.map((x) => x.job)).toEqual(expect.arrayContaining(['reminders', 'digest', 'inactivity', 'carry-over']));
    expect(r.every((x) => x.status === 'ok' || x.status === 'partial')).toBe(true);
  });
});
