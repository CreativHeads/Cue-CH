// Scheduled jobs (developer brief §12). Each is idempotent, holds an advisory lock, and writes a sync_runs row.
import { addDays, diffDays, fmtD, fmtT, fmtYM, istDate, istTime, mondayOf, todayIST, toDueAt, ymAdd, ymOf } from './dates';
import { db, row, rows, type Db, type Driver } from './db';
import { fetchWindsor, POST_FIELDS, postsWindow, STORY_FIELDS, storiesWindow, upsertPosts } from './instagram';
import { matchClient, revertDeleted } from './matching';
import { deliveryScore, scoreParts } from './score';
import { esc, getSettings, leadsAndAdmins, notify, notifyChat, type Notice, type NoticeResult } from './telegram';
import { STAGE_LABEL, TYPE_LABEL, typeCount, type ContentType, type Stage } from './types';

export const JOBS = ['sync-posts', 'sync-stories', 'reminders', 'digest', 'inactivity', 'carry-over', 'month-close', 'next-month'] as const;
export type JobName = (typeof JOBS)[number];
/** Expected interval in minutes, for the health page (stale = no success in twice this). */
export const JOB_INTERVAL: Record<JobName, number> = {
  'sync-posts': 180, 'sync-stories': 120, reminders: 15, digest: 1440, inactivity: 1440, 'carry-over': 10080, 'month-close': 44640, 'next-month': 44640,
};
const LABEL: Record<JobName, string> = {
  'sync-posts': 'Instagram posts', 'sync-stories': 'Instagram stories', reminders: 'Nudges and overdue alerts', digest: 'Morning digest',
  inactivity: 'Inactivity flags', 'carry-over': 'Weekly carry-over', 'month-close': 'Month-end scores', 'next-month': 'Next-month plan prompt',
};
export const jobLabel = (j: string) => LABEL[j as JobName] ?? j;

type Stats = Record<string, unknown>;
const tally = (results: NoticeResult[]) => results.reduce<Record<string, number>>((a, r) => ((a[r] = (a[r] ?? 0) + 1), a), {});

/** Run a job under an advisory lock and record it. Returns null if another run holds the lock. */
export async function runJob(name: JobName, opts: { now?: Date; fetcher?: typeof fetch; driver?: Driver } = {}) {
  const d = opts.driver ?? db();
  const got = await row<{ ok: boolean }>(`select pg_try_advisory_lock(hashtext($1)) ok`, [`job:${name}`], d);
  if (!got?.ok) return null;
  const run = (await row<{ id: string }>(`insert into sync_runs (job) values ($1) returning id`, [name], d))!;
  try {
    const stats = await HANDLERS[name](d, opts.now ?? new Date(), opts.fetcher);
    const status = (stats as { partial?: boolean }).partial ? 'partial' : 'ok';
    await d.query(`update sync_runs set finished_at = now(), status = $2, stats = $3, error = $4 where id = $1`,
      [run.id, status, JSON.stringify(stats), (stats as { note?: string }).note ?? null]);
    return { status, stats };
  } catch (e) {
    await d.query(`update sync_runs set finished_at = now(), status = 'failed', error = $2 where id = $1`, [run.id, (e as Error).message]);
    if (name === 'sync-posts' || name === 'sync-stories') await alertIfStale(d, name, opts.now ?? new Date());
    return { status: 'failed', error: (e as Error).message };
  } finally {
    await d.query(`select pg_advisory_unlock(hashtext($1))`, [`job:${name}`]);
  }
}

const HANDLERS: Record<JobName, (d: Driver, now: Date, fetcher?: typeof fetch) => Promise<Stats>> = {
  'sync-posts': (d, now, f) => syncInstagram(d, now, false, f),
  'sync-stories': (d, now, f) => syncInstagram(d, now, true, f),
  reminders: (d, now, f) => reminders(d, now, f),
  digest: (d, now, f) => digest(d, now, f),
  inactivity: (d, now, f) => inactivity(d, now, f),
  'carry-over': (d, now) => carryOver(d, now),
  'month-close': (d, now) => monthClose(d, now),
  'next-month': (d, now, f) => nextMonth(d, now, f),
};

// ---------- Phase 2/5: Instagram ----------
async function syncInstagram(d: Driver, now: Date, stories: boolean, fetcher?: typeof fetch): Promise<Stats> {
  if (!process.env.WINDSOR_API_KEY) return { partial: true, note: 'Instagram data source not configured (WINDSOR_API_KEY)' };
  const win = stories ? storiesWindow() : postsWindow();
  const raw = await fetchWindsor(stories ? STORY_FIELDS : POST_FIELDS, win.from, win.to, fetcher);
  const up = await upsertPosts(d, raw, { stories, lookbackFrom: stories ? undefined : toDueAt(win.from, '00:00') });
  const reverted = await revertDeleted(d, up.deletedPosts.map((p) => p.id));
  const settings = await getSettings(d);
  const leads = await leadsAndAdmins(d);
  for (const t of reverted) {
    const client = await row<{ name: string }>(`select name from clients where id = $1`, [t.client_id], d);
    const text = `⚠️ A post for <b>${esc(client?.name ?? '')}</b> was removed from Instagram. “${esc(t.title)}” is back in Scheduled.`;
    for (const sid of new Set([t.owner_id, ...leads.filter((l) => l.role === 'lead').map((l) => l.id)].filter(Boolean) as string[])) {
      await notify(d, { staffId: sid, kind: 'deleted', dedupeKey: `deleted:${t.id}:${sid}:${istDate(now)}`, text, taskId: t.id, clientId: t.client_id, urgent: true }, settings, { now, fetcher });
    }
  }
  const clients = await rows<{ id: string }>(`select id from clients where is_connected and status <> 'archived'`, [], d);
  const matched: Record<string, number> = { matched: 0, review: 0, extra: 0, verified: 0 };
  for (const c of clients) {
    const separately = !!(await row<{ v: boolean }>(
      `select bool_or(story_frames_count_separately) v from plan_items i join plans p on p.id = i.plan_id where p.client_id = $1 and i.content_type = 'story'`, [c.id], d))?.v;
    const s = await d.transaction(null, (tx) => matchClient(tx, c.id, { storyFramesSeparately: separately }));
    for (const k of Object.keys(matched)) matched[k] += (s as unknown as Record<string, number>)[k];
  }
  return { fetched: up.fetched, upserted: up.upserted, ignored: up.ignored, deleted: up.deleted, unknownAccounts: up.unknownAccounts, ...matched,
    partial: up.unknownAccounts.length > 0, note: up.unknownAccounts.length ? `Rows for unmapped accounts: ${up.unknownAccounts.join(', ')}` : undefined };
}

/** After 2 failed runs in a row, tell the admin (worded without tool names). */
async function alertIfStale(d: Driver, job: JobName, now: Date) {
  const last = await rows<{ status: string }>(`select status from sync_runs where job = $1 and finished_at is not null order by started_at desc limit 2`, [job], d);
  if (last.length < 2 || last.some((r) => r.status !== 'failed')) return;
  const ok = await row<{ t: string }>(`select max(finished_at) t from sync_runs where job = $1 and status in ('ok', 'partial')`, [job], d);
  const since = ok?.t ? `${fmtD(istDate(ok.t))}, ${fmtT(istTime(ok.t))}` : 'a while';
  const settings = await getSettings(d);
  for (const a of (await leadsAndAdmins(d)).filter((x) => x.role === 'admin')) {
    await notify(d, { staffId: a.id, kind: 'data_stale', dedupeKey: `stale:${job}:${istDate(now)}:${a.id}`, urgent: true,
      text: `Instagram ${job === 'sync-stories' ? 'stories' : 'posts'} haven’t updated since ${since}. The app will keep retrying.` }, settings, { now });
  }
}

// ---------- Phase 3: reminders ----------
export interface TaskRow { id: string; title: string; client_id: string; client: string; content_type: ContentType; due_at: string; stage: Stage; owner_id: string | null; priority: string; carried_over_from: string | null; delivery: string | null }
const TASK_SELECT = `select t.id, t.title, t.client_id, c.name as client, t.content_type, t.due_at, t.stage, t.owner_id, t.priority, t.carried_over_from, t.delivery
  from tasks t join clients c on c.id = t.client_id`;
const nextStage = (s: Stage): Stage | null => (['to_brief', 'designing', 'client_review', 'approved', 'scheduled', 'posted'] as Stage[])[['to_brief', 'designing', 'client_review', 'approved', 'scheduled', 'posted'].indexOf(s) + 1] ?? null;
const appUrl = (path = '') => (process.env.APP_URL ? `${process.env.APP_URL.replace(/\/$/, '')}${path}` : null);
const openButton = (taskId: string) => { const u = appUrl(`/tasks?task=${taskId}`); return u ? [{ text: 'Open task', url: u }] : []; };

async function reminders(d: Driver, now: Date, fetcher?: typeof fetch): Promise<Stats> {
  const s = await getSettings(d);
  const results: NoticeResult[] = [];
  const lead = (await leadsAndAdmins(d)).find((l) => l.role === 'lead');
  if (s.nudge_enabled) {
    // due within 2 hours and not yet approved
    const due = await rows<TaskRow>(`${TASK_SELECT} where t.stage in ('to_brief','designing','client_review') and t.due_at > $1 and t.due_at <= $2`,
      [now.toISOString(), new Date(now.getTime() + 2 * 36e5).toISOString()], d);
    for (const t of due) {
      if (!t.owner_id) continue;
      const text = `⏰ <b>${esc(t.client)}</b> ${TYPE_LABEL[t.content_type].toLowerCase()} is due at ${fmtT(istTime(t.due_at))} and isn’t approved yet.\n“${esc(t.title)}” · ${STAGE_LABEL[t.stage]}`;
      const buttons = [[{ text: 'Mark approved', data: `stg:${t.id}:approved` }, ...openButton(t.id)]];
      const urgent = istTime(t.due_at) < '10:00';
      results.push(await notify(d, { staffId: t.owner_id, kind: 'nudge_2h', dedupeKey: `nudge_2h:${t.id}`, text, buttons, taskId: t.id, clientId: t.client_id, urgent }, s, { now, fetcher }));
      if (lead && lead.id !== t.owner_id) results.push(await notify(d, { staffId: lead.id, kind: 'nudge_2h', dedupeKey: `nudge_2h:${t.id}:lead`, text, buttons, taskId: t.id, clientId: t.client_id, urgent }, s, { now, fetcher }));
    }
  }
  if (s.overdue_enabled) {
    const late = await rows<TaskRow>(`${TASK_SELECT} where t.stage <> 'posted' and t.due_at < $1 and t.due_at > $2`,
      [now.toISOString(), new Date(now.getTime() - 7 * 864e5).toISOString()], d);
    const today = istDate(now);
    for (const t of late) {
      const when = istDate(t.due_at) === today ? 'today' : `on ${fmtD(istDate(t.due_at))}`;
      const text = `🔴 Overdue: <b>${esc(t.client)}</b> ${TYPE_LABEL[t.content_type].toLowerCase()} was due ${when} at ${fmtT(istTime(t.due_at))}. Stage: ${STAGE_LABEL[t.stage]}.\n“${esc(t.title)}”`;
      const nx = nextStage(t.stage);
      const buttons = [[...(nx && nx !== 'posted' ? [{ text: STAGE_LABEL[nx], data: `stg:${t.id}:${nx}` }] : []), ...openButton(t.id)]];
      for (const sid of new Set([t.owner_id, lead?.id].filter(Boolean) as string[])) {
        results.push(await notify(d, { staffId: sid, kind: 'overdue', dedupeKey: `overdue:${t.id}:${today}:${sid}`, text, buttons, taskId: t.id, clientId: t.client_id }, s, { now, fetcher }));
      }
    }
  }
  return tally(results);
}

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MAX_PER_PERSON = 12;

/** The team group's morning message: today's tasks under each person, then unassigned, then overdue. */
export function groupDigestText(today: string, todays: TaskRow[], overdue: TaskRow[], names: Record<string, string | { name: string; telegram_chat_id?: string | null }>) {
  const staffOf = (id: string | null) => {
    if (!id) return { name: 'Unassigned', mention: '<b>Unassigned</b>', telegram_chat_id: null };
    const val = names[id];
    if (!val) return { name: 'Former teammate', mention: '<b>Former teammate</b>', telegram_chat_id: null };
    if (typeof val === 'string') return { name: val, mention: `<b>${esc(val)}</b>`, telegram_chat_id: null };
    const mention = val.telegram_chat_id ? `<a href="tg://user?id=${val.telegram_chat_id}">@${esc(val.name)}</a>` : `<b>${esc(val.name)}</b>`;
    return { name: val.name, mention, telegram_chat_id: val.telegram_chat_id ?? null };
  };
  const byOwner = new Map<string, { member: { name: string; mention: string }; tasks: TaskRow[] }>();
  for (const t of todays) {
    const s = staffOf(t.owner_id);
    const existing = byOwner.get(s.name);
    if (existing) existing.tasks.push(t);
    else byOwner.set(s.name, { member: s, tasks: [t] });
  }
  const order = [...byOwner.keys()].sort((a, b) => (a === 'Unassigned' ? 1 : b === 'Unassigned' ? -1 : a.localeCompare(b)));
  const lines = [`☀️ <b>Today’s tasks · ${DOW[new Date(`${today}T00:00:00Z`).getUTCDay()]}, ${fmtD(today)}</b>`];
  if (!todays.length) lines.push('', 'Nothing due today.');
  for (const key of order) {
    const { member, tasks: list } = byOwner.get(key)!;
    lines.push('', `${member.mention} (${list.length})`);
    for (const t of list.slice(0, MAX_PER_PERSON)) {
      lines.push(`• ${fmtT(istTime(t.due_at))} · ${esc(t.client)} · ${TYPE_LABEL[t.content_type]}${t.priority === 'high' ? ' · 🔺 High' : ''}\n   “${esc(t.title)}” · ${STAGE_LABEL[t.stage]}`);
    }
    if (list.length > MAX_PER_PERSON) lines.push(`   …and ${list.length - MAX_PER_PERSON} more`);
  }
  if (overdue.length) {
    lines.push('', `🔴 <b>Overdue</b> (${overdue.length})`);
    for (const t of overdue.slice(0, MAX_PER_PERSON)) {
      const s = staffOf(t.owner_id);
      const tag = s.telegram_chat_id ? `<a href="tg://user?id=${s.telegram_chat_id}">@${esc(s.name)}</a>` : esc(s.name);
      lines.push(`• ${tag}: ${esc(t.client)} ${TYPE_LABEL[t.content_type].toLowerCase()}, due ${fmtD(istDate(t.due_at))} · ${STAGE_LABEL[t.stage]}`);
    }
    if (overdue.length > MAX_PER_PERSON) lines.push(`   …and ${overdue.length - MAX_PER_PERSON} more`);
  }
  return lines.join('\n');
}

async function digest(d: Driver, now: Date, fetcher?: typeof fetch): Promise<Stats> {
  const s = await getSettings(d);
  if (!s.digest_enabled) return { note: 'digest turned off' };
  const today = istDate(now), yesterday = addDays(today, -1);
  const staff = await rows<{ id: string; name: string; role: string; telegram_chat_id: string | null }>(`select id, name, role, telegram_chat_id from staff where is_active`, [], d);
  const unlinked = staff.filter((x) => !x.telegram_chat_id).map((x) => x.name);
  const results: NoticeResult[] = [];
  const toGroup = s.digest_target !== 'personal' && !!s.team_group_chat_id;
  const toPersonal = s.digest_target !== 'group' || !s.team_group_chat_id;

  if (toGroup) {
    const todays = await rows<TaskRow>(`${TASK_SELECT} where t.stage <> 'posted' and t.due_at >= $1 and t.due_at < $2 order by t.due_at, c.name`,
      [toDueAt(today, '00:00'), toDueAt(addDays(today, 1), '00:00')], d);
    const overdue = await rows<TaskRow>(`${TASK_SELECT} where t.stage <> 'posted' and t.due_at < $1 and t.due_at > $2 order by t.due_at`,
      [toDueAt(today, '00:00'), toDueAt(addDays(today, -14), '00:00')], d);
    const staffMap = Object.fromEntries(staff.map((x) => [x.id, { name: x.name, telegram_chat_id: x.telegram_chat_id }]));
    const board = appUrl('/board');
    results.push(await notifyChat(d, s.team_group_chat_id!, { kind: 'digest_group', dedupeKey: `digest_group:${today}`,
      text: groupDigestText(today, todays, overdue, staffMap), buttons: board ? [[{ text: 'Open the board', url: board }]] : undefined }, s, { now, fetcher }));
  }
  if (!toPersonal) return tally(results);
  for (const p of staff) {
    const lead = p.role === 'lead' || p.role === 'admin';
    const mine = (sql: string, params: unknown[]) => rows<TaskRow>(`${TASK_SELECT} where ${lead ? 'true' : 't.owner_id = $1'} and ${sql} order by t.priority desc, t.due_at`,
      lead ? params.slice(1) : params, d);
    const off = lead ? 0 : 1;
    const ph = (n: number) => `$${n + off}`;
    const todays = await mine(`t.stage <> 'posted' and t.due_at >= ${ph(1)} and t.due_at < ${ph(2)}`, [p.id, toDueAt(today, '00:00'), toDueAt(addDays(today, 1), '00:00')]);
    const overdue = await mine(`t.stage <> 'posted' and t.due_at < ${ph(1)} and t.due_at > ${ph(2)}`, [p.id, toDueAt(today, '00:00'), toDueAt(addDays(today, -14), '00:00')]);
    const waiting = await mine(`t.stage = 'client_review'`, [p.id]);
    const unverified = await mine(`t.content_type = 'story' and t.delivery = 'manual_unverified' and t.due_at >= ${ph(1)} and t.due_at < ${ph(2)}`, [p.id, toDueAt(yesterday, '00:00'), toDueAt(today, '00:00')]);
    const scope = (list: TaskRow[]) => (lead ? list : list.filter((t) => t.owner_id === p.id));
    const group = (list: TaskRow[]) => {
      const counts: Partial<Record<ContentType, number>> = {};
      list.forEach((t) => (counts[t.content_type] = (counts[t.content_type] ?? 0) + 1));
      return Object.entries(counts).map(([k, n]) => typeCount(n!, k as ContentType)).join(', ');
    };
    const lines = [`☀️ Good morning ${esc(p.name)}.`];
    const td = scope(todays);
    lines.push(td.length ? `<b>Today:</b> ${group(td)} (${td.slice(0, 4).map((t) => `${esc(t.client)} ${fmtT(istTime(t.due_at))}`).join(', ')}${td.length > 4 ? ', …' : ''}).` : '<b>Today:</b> nothing due.');
    const od = scope(overdue);
    if (od.length) lines.push(`<b>Overdue:</b> ${od.slice(0, 4).map((t) => `${TYPE_LABEL[t.content_type].toLowerCase()} for ${esc(t.client)}`).join(', ')}${od.length > 4 ? ` and ${od.length - 4} more` : ''}.`);
    const carried = [...td, ...od].filter((t) => t.carried_over_from);
    if (carried.length) lines.push(`<b>Carried over from last week:</b> ${carried.length}.`);
    lines.push(`<b>Waiting on client:</b> ${scope(waiting).length}.`);
    const uv = scope(unverified);
    if (uv.length) lines.push(`Please confirm yesterday’s stories were posted: ${uv.map((t) => esc(t.client)).join(', ')}.`);
    if (lead && unlinked.length) lines.push(`Not receiving reminders: ${unlinked.map(esc).join(', ')}.`);
    results.push(await notify(d, { staffId: p.id, kind: 'digest', dedupeKey: `digest:${p.id}:${today}`, text: lines.join('\n') }, s, { now, fetcher }));
  }
  return tally(results);
}

async function inactivity(d: Driver, now: Date, fetcher?: typeof fetch): Promise<Stats> {
  const s = await getSettings(d);
  if (!s.inactivity_enabled) return { note: 'inactivity flags turned off' };
  const today = istDate(now);
  const clients = await rows<{ id: string; name: string; inactivity_days: number }>(`select id, name, inactivity_days from clients where status = 'active'`, [], d);
  const leads = await leadsAndAdmins(d);
  const results: NoticeResult[] = [];
  let flagged = 0;
  for (const c of clients) {
    const last = await row<{ t: string | null }>(
      `select greatest((select max(posted_at) from ig_posts where client_id = $1 and status <> 'ignored' and deleted_at is null),
                       (select max(posted_at) from tasks where client_id = $1)) t`, [c.id], d);
    const lastDay = last?.t ? istDate(last.t) : null;
    const days = lastDay ? diffDays(today, lastDay) : null;
    if (days !== null && days < c.inactivity_days) continue;
    const since = lastDay ? toDueAt(addDays(lastDay, 1), '00:00') : toDueAt(addDays(today, -c.inactivity_days), '00:00');
    const expected = await row<{ n: number; missed: number }>(
      `select count(*)::int n, count(*) filter (where stage <> 'posted')::int missed from tasks where client_id = $1 and due_at >= $2 and due_at < $3`,
      [c.id, since, toDueAt(today, '00:00')], d);
    if (!expected?.n) continue;
    flagged++;
    const text = `🚩 <b>${esc(c.name)}</b>: no posts for ${days ?? 'several'} days. ${expected.missed} planned item${expected.missed === 1 ? '' : 's'} missed.`;
    for (const l of leads) results.push(await notify(d, { staffId: l.id, kind: 'inactivity', dedupeKey: `inactivity:${c.id}:${today}:${l.id}`, text, clientId: c.id }, s, { now, fetcher }));
  }
  return { flagged, ...tally(results) };
}

// ---------- weekly carry-over (Monday 00:15 IST) ----------
async function carryOver(d: Driver, now: Date): Promise<Stats> {
  const lastMon = addDays(mondayOf(istDate(now)), -7);
  const r = await d.transaction(null, (tx) => rows(
    `update tasks set priority = 'high', carried_over_from = $1
      where stage <> 'posted' and carried_over_from is null and due_at >= $2 and due_at < $3 returning id`,
    [lastMon, toDueAt(lastMon, '00:00'), toDueAt(addDays(lastMon, 7), '00:00')], tx));
  return { carried: r.length, week: lastMon };
}

// ---------- Phase 5: month-end score (1st provisional, 8th final) ----------
export async function computeMonthScores(on: Db, month: string, final: boolean) {
  const clients = await rows<{ id: string }>(`select id from clients where status <> 'archived'`, [], on);
  const from = toDueAt(`${month}-01`, '00:00'), to = toDueAt(`${ymAdd(month, 1)}-01`, '00:00');
  const out = [];
  for (const c of clients) {
    const tasks = await rows<{ due_at: string; stage: string; delivery: string | null }>(`select due_at, stage, delivery from tasks where client_id = $1 and due_at >= $2 and due_at < $3`, [c.id, from, to], on);
    if (!tasks.length) continue;
    const extra = (await row<{ n: number }>(`select count(*)::int n from ig_posts where client_id = $1 and status = 'extra' and posted_at >= $2 and posted_at < $3`, [c.id, from, to], on))!.n;
    const p = scoreParts(tasks as never, extra);
    const score = deliveryScore(p);
    await on.query(
      `insert into monthly_scores (client_id, month, planned, on_time, late, missed, extra, score, is_final) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       on conflict (client_id, month) do update set planned = excluded.planned, on_time = excluded.on_time, late = excluded.late,
         missed = excluded.missed, extra = excluded.extra, score = excluded.score, is_final = excluded.is_final`,
      [c.id, `${month}-01`, p.planned, p.onTime, p.late, p.missed, p.extra, score == null ? null : Math.round(score * 10) / 10, final]);
    out.push({ client: c.id, score });
  }
  if (final) await on.query(`update plans set status = 'closed' where month = $1 and status = 'active'`, [`${month}-01`]);
  return out;
}

async function monthClose(d: Driver, now: Date): Promise<Stats> {
  const today = istDate(now), day = +today.slice(8);
  if (day !== 1 && day !== 8) return { note: 'runs on the 1st and the 8th' };
  const month = ymAdd(ymOf(today), -1);
  const scores = await d.transaction(null, (tx) => computeMonthScores(tx, month, day === 8));
  return { month, final: day === 8, clients: scores.length };
}

// ---------- 25th: ask the lead to review next month's drafts ----------
async function nextMonth(d: Driver, now: Date, fetcher?: typeof fetch): Promise<Stats> {
  const today = istDate(now);
  if (+today.slice(8) !== 25) return { note: 'runs on the 25th' };
  const next = ymAdd(ymOf(today), 1);
  const plans = await rows<{ name: string; status: string | null }>(
    `select c.name, p.status from clients c left join plans p on p.client_id = c.id and p.month = $1 where c.status = 'active' order by c.name`, [`${next}-01`], d);
  const drafts = plans.filter((p) => p.status === 'draft').map((p) => esc(p.name));
  const missing = plans.filter((p) => !p.status).map((p) => esc(p.name));
  if (!drafts.length && !missing.length) return { note: 'all plans active' };
  const s = await getSettings(d);
  const text = [`🗓 ${fmtYM(next)} plans need a look.`, drafts.length ? `<b>Drafts to activate:</b> ${drafts.join(', ')}.` : '', missing.length ? `<b>No plan yet:</b> ${missing.join(', ')}.` : '']
    .filter(Boolean).join('\n');
  const u = appUrl('/plans');
  const results: NoticeResult[] = [];
  for (const l of (await leadsAndAdmins(d)).filter((x) => x.role === 'lead')) {
    results.push(await notify(d, { staffId: l.id, kind: 'next_month', dedupeKey: `next_month:${next}:${l.id}`, text, buttons: u ? [[{ text: 'Review plans', url: u }]] : undefined }, s, { now, fetcher }));
  }
  return tally(results);
}

export type { Notice };
