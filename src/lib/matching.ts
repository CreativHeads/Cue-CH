// Match Instagram posts to planned tasks (developer brief §5.2).
import { addDays, diffDays, istDate, mondayOf } from './dates';
import { row, rows, type Db } from './db';
import { HttpError } from './errors';
import type { ContentType, Stage } from './types';

export const AUTO = 70, SUGGEST = 40;
const COMPATIBLE: [ContentType, ContentType][] = [
  ['poster', 'carousel'],
  ['reel', 'video'],
  ['reel', 'creative_reel'],
  ['presentation_video', 'video'],
];
export const compatible = (a: ContentType, b: ContentType) => COMPATIBLE.some(([x, y]) => (a === x && b === y) || (a === y && b === x));

export interface Post { id: string; client_id: string; content_type: ContentType; posted_at: string; permalink: string | null; shortcode: string | null; is_story: boolean; status: string; relationship: string | null; owner_username: string | null }
export interface OpenTask { id: string; content_type: ContentType; due_at: string; seq: number | null; stage: Stage; permalink: string | null; delivery: string | null }

/** Score a task for a post: type fit, minus 8 per day off, minus 5 more if early, plus 5 if approved/scheduled. -1 = no fit. */
export function scoreTask(t: Pick<OpenTask, 'content_type' | 'due_at' | 'stage'>, post: Pick<Post, 'content_type' | 'posted_at'>): number {
  const typeScore = t.content_type === post.content_type ? 100 : compatible(t.content_type, post.content_type) ? 60 : 0;
  if (!typeScore) return -1;
  const days = diffDays(istDate(post.posted_at), istDate(t.due_at)); // +late / -early
  let s = typeScore - 8 * Math.abs(days) - (days < 0 ? 5 : 0);
  if (t.stage === 'approved' || t.stage === 'scheduled') s += 5;
  return s;
}

/** Best candidate: highest score; ties go to the earliest due, then the lowest seq. */
export function pickBest(post: Pick<Post, 'content_type' | 'posted_at'>, tasks: OpenTask[]) {
  let best: OpenTask | null = null, bestScore = -1;
  for (const t of tasks) {
    const d = diffDays(istDate(post.posted_at), istDate(t.due_at));
    if (d > 7 || d < -3) continue;
    const s = scoreTask(t, post);
    if (s < 0) continue;
    if (s > bestScore || (s === bestScore && best && (t.due_at < best.due_at || (t.due_at === best.due_at && (t.seq ?? 0) < (best.seq ?? 0))))) { best = t; bestScore = s; }
  }
  return { task: best, score: bestScore };
}

/** Attach a post to a task: task becomes Posted with delivery and flags; history recorded. */
export async function attach(on: Db, taskId: string, postId: string, method: 'auto' | 'suggested' | 'manual', score: number | null, actor: string | null) {
  const t = (await row<OpenTask & { flags: string[] }>(`select * from tasks where id = $1`, [taskId], on))!;
  const p = (await row<Post & { collaborators: string | null }>(`select * from ig_posts where id = $1`, [postId], on))!;
  const late = istDate(p.posted_at) > istDate(t.due_at);
  const flags = new Set((t.flags ?? []).filter((f) => !['swapped_type', 'late', 'deleted', 'collab'].includes(f)));
  if (t.content_type !== p.content_type) flags.add('swapped_type');
  if (late) flags.add('late');
  if ((p.relationship && p.relationship.toUpperCase() !== 'OWNED')) flags.add('collab');
  await on.query(`update post_matches set revoked_at = now() where (task_id = $1 or post_id = $2) and revoked_at is null`, [taskId, postId]);
  await on.query(`insert into post_matches (task_id, post_id, method, score, matched_by) values ($1, $2, $3, $4, $5)`, [taskId, postId, method, score, actor]);
  await on.query(
    `update tasks set stage = 'posted', posted_at = $2, post_id = $3, permalink = coalesce($4, permalink), delivery = $5, flags = $6 where id = $1`,
    [taskId, p.posted_at, postId, p.permalink, late ? 'late' : 'on_time', [...flags]]);
  await on.query(`update ig_posts set status = 'matched', suggested_task_id = null, match_score = $2, manual = $3, decided_by = $4 where id = $1`,
    [postId, score, method === 'manual', actor]);
  await on.query(`insert into task_events (task_id, actor_id, type, to_value) values ($1, $2, 'match', $3)`,
    [taskId, actor, `${method}${score != null ? `:${score}` : ''}:${postId}`]);
}

/** Detach a post: the task returns to Scheduled, the post goes back to review. */
export async function unmatchTask(on: Db, taskId: string, actor: string | null) {
  const t = await row<{ post_id: string | null }>(`select post_id from tasks where id = $1`, [taskId], on);
  if (!t?.post_id) throw new HttpError(409, 'This task has no matched post');
  await on.query(`update post_matches set revoked_at = now() where task_id = $1 and revoked_at is null`, [taskId]);
  await on.query(`update ig_posts set status = 'pending_review', suggested_task_id = $2, manual = true, decided_by = $3 where id = $1`, [t.post_id, taskId, actor]);
  await on.query(`update tasks set stage = 'scheduled', post_id = null, posted_at = null, delivery = null, flags = array_remove(array_remove(flags, 'late'), 'swapped_type') where id = $1`, [taskId]);
  await on.query(`insert into task_events (task_id, actor_id, type, from_value) values ($1, $2, 'unmatch', $3)`, [taskId, actor, t.post_id]);
}

export interface MatchStats { matched: number; review: number; extra: number; verified: number }

/** Open tasks of a client that could take a post (window covers the brief's -7/+3 days). */
async function openTasks(on: Db, clientId: string, from: string, to: string) {
  return rows<OpenTask>(
    `select id, content_type, due_at, seq, stage, permalink, delivery from tasks
      where client_id = $1 and stage <> 'posted' and post_id is null and due_at >= $2 and due_at < $3 order by due_at, seq`,
    [clientId, from, to], on);
}

/**
 * Run matching for one client. Posts are processed oldest first. Manual decisions are never
 * revisited. Safe to re-run: matched posts are skipped, the rest are re-evaluated.
 */
export async function matchClient(on: Db, clientId: string, opts: { storyFramesSeparately?: boolean } = {}): Promise<MatchStats> {
  const stats: MatchStats = { matched: 0, review: 0, extra: 0, verified: 0 };
  const posts = await rows<Post>(
    `select id, client_id, content_type, posted_at, permalink, shortcode, is_story, status, relationship, owner_username from ig_posts
      where client_id = $1 and status in ('pending_review', 'extra') and not manual and deleted_at is null order by posted_at`, [clientId], on);
  if (!posts.length) return stats;

  // 1. a hand-marked "posted" task is verified by the post with the same link
  const manualTasks = await rows<{ id: string; permalink: string }>(
    `select id, permalink from tasks where client_id = $1 and delivery = 'manual_unverified' and post_id is null and permalink is not null`, [clientId], on);
  const remaining: Post[] = [];
  for (const p of posts) {
    const mt = manualTasks.find((t) => samePost(t.permalink, p));
    if (mt) {
      await attach(on, mt.id, p.id, 'auto', null, null);
      manualTasks.splice(manualTasks.indexOf(mt), 1);
      stats.verified++;
    } else remaining.push(p);
  }

  // 2. stories: per IST day, in posting order; frames within 10 minutes count as one story
  const stories = remaining.filter((p) => p.content_type === 'story');
  const feed = remaining.filter((p) => p.content_type !== 'story');
  const units: Post[][] = [];
  for (const s of stories) {
    const lastUnit = units[units.length - 1];
    const prev = lastUnit?.[lastUnit.length - 1];
    if (!opts.storyFramesSeparately && prev && istDate(prev.posted_at) === istDate(s.posted_at) && Date.parse(s.posted_at) - Date.parse(prev.posted_at) <= 10 * 60e3) lastUnit.push(s);
    else units.push([s]);
  }
  for (const unit of units) {
    const head = unit[0], day = istDate(head.posted_at);
    const week = mondayOf(day);
    const cands = await openTasks(on, clientId, new Date(`${week}T00:00:00+05:30`).toISOString(), new Date(`${addDays(day, 1)}T00:00:00+05:30`).toISOString());
    const storyTasks = cands.filter((t) => t.content_type === 'story');
    // that day's story tasks first, then unfilled ones earlier in the same week (late)
    const target = storyTasks.find((t) => istDate(t.due_at) === day) ?? storyTasks.find((t) => istDate(t.due_at) < day);
    if (target) {
      await attach(on, target.id, head.id, 'auto', null, null);
      for (const extraFrame of unit.slice(1)) await on.query(`update ig_posts set status = 'matched', suggested_task_id = null where id = $1`, [extraFrame.id]);
      stats.matched++;
    } else {
      for (const p of unit) await on.query(`update ig_posts set status = 'extra', suggested_task_id = null where id = $1`, [p.id]);
      stats.extra++;
    }
  }

  // 3. feed posts by score
  for (const p of feed) {
    const d = istDate(p.posted_at);
    const cands = await openTasks(on, clientId, new Date(`${addDays(d, -7)}T00:00:00+05:30`).toISOString(), new Date(`${addDays(d, 4)}T00:00:00+05:30`).toISOString()); // due 7 days before .. 3 days after
    const { task, score } = pickBest(p, cands);
    if (task && score >= AUTO) { await attach(on, task.id, p.id, 'auto', score, null); stats.matched++; }
    else if (task && score >= SUGGEST) {
      await on.query(`update ig_posts set status = 'pending_review', suggested_task_id = $2, match_score = $3 where id = $1`, [p.id, task.id, score]);
      stats.review++;
    } else {
      await on.query(`update ig_posts set status = 'extra', suggested_task_id = null, match_score = null where id = $1`, [p.id]);
      stats.extra++;
    }
  }
  return stats;
}

function samePost(link: string, p: Pick<Post, 'permalink' | 'shortcode'>) {
  const code = (u: string | null) => u?.match(/instagram\.com\/(?:p|reel|reels|tv|stories\/[^/]+)\/([^/?#]+)/i)?.[1] ?? null;
  const a = code(link);
  return (!!p.permalink && link.replace(/\/+$/, '') === p.permalink.replace(/\/+$/, '')) || (!!a && (a === p.shortcode || a === code(p.permalink)));
}

/** A deleted post reverts its task to Scheduled with the deleted flag. Returns affected task ids. */
export async function revertDeleted(on: Db, postIds: string[]) {
  if (!postIds.length) return [];
  const tasks = await rows<{ id: string; owner_id: string | null; client_id: string; title: string }>(
    `select id, owner_id, client_id, title from tasks where post_id = any($1::uuid[])`, [postIds], on);
  for (const t of tasks) {
    await on.query(`update post_matches set revoked_at = now() where task_id = $1 and revoked_at is null`, [t.id]);
    await on.query(`update tasks set stage = 'scheduled', post_id = null, posted_at = null, delivery = null,
                      flags = array_append(array_remove(flags, 'deleted'), 'deleted') where id = $1`, [t.id]);
    await on.query(`insert into task_events (task_id, type, to_value) values ($1, 'unmatch', 'deleted on Instagram')`, [t.id]);
  }
  return tasks;
}
