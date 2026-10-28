// Instagram data via Windsor.ai (developer brief §5.1): fetch, normalise, upsert, detect deletions.
import { addDays, istDate, todayIST } from './dates';
import { row, rows, type Db } from './db';
import type { ContentType } from './types';

export const POST_FIELDS = [
  'account_id', 'media_id', 'media_type', 'media_product_type', 'media_permalink', 'media_shortcode', 'timestamp',
  'media_caption', 'media_reach', 'media_like_count', 'media_comments_count', 'media_saved', 'media_views',
  'media_thumbnail_url', 'media_relationship', 'media_owner_username', 'media_collaborators',
];
// Story field names as Windsor's Instagram connector names them (checked against the live API); override with WINDSOR_STORY_FIELDS.
export const STORY_FIELDS = (process.env.WINDSOR_STORY_FIELDS || 'account_id,story_id,story_timestamp,story_permalink,story_reach,media_type').split(',');

export type RawRow = Record<string, unknown>;

/** Normalise Instagram's media/product type to our content type; null = ignore (ads). */
export function normaliseType(mediaType?: unknown, productType?: unknown, isStory = false): ContentType | null {
  const m = String(mediaType ?? '').toUpperCase(), p = String(productType ?? '').toUpperCase();
  if (p === 'AD') return null;
  if (isStory || p === 'STORY') return 'story';
  // Instagram reports reels as REELS/REELS; older data uses REEL or VIDEO + REELS
  if (m === 'REEL' || m === 'REELS' || p === 'REELS') return 'reel';
  if (m === 'CAROUSEL_ALBUM') return 'carousel';
  if (m === 'IMAGE') return 'poster';
  if (m === 'VIDEO') return 'video';
  return 'other';
}

const num = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number.isFinite(Number(v)) ? Math.round(Number(v)) : null);
const str = (v: unknown) => (v === null || v === undefined || v === '' ? null : String(v));

/** GET from Windsor with 3 attempts and backoff. Throws after the last failure. */
export async function fetchWindsor(fields: string[], dateFrom: string, dateTo: string, fetcher: typeof fetch = fetch): Promise<RawRow[]> {
  const key = process.env.WINDSOR_API_KEY;
  if (!key) throw new Error('WINDSOR_API_KEY is not set');
  const url = `${process.env.WINDSOR_BASE_URL || 'https://connectors.windsor.ai/instagram'}?api_key=${encodeURIComponent(key)}`
    + `&date_from=${dateFrom}&date_to=${dateTo}&fields=${fields.join(',')}`;
  let last: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetcher(url, { headers: { accept: 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json() as { data?: RawRow[] } | RawRow[];
      return Array.isArray(body) ? body : body.data ?? [];
    } catch (e) {
      last = e;
      if (attempt < 3) await new Promise((r) => setTimeout(r, 1000 * 4 ** (attempt - 1)));
    }
  }
  throw new Error(`Instagram data request failed after 3 attempts: ${(last as Error).message}`);
}

interface ClientRef { id: string; windsor_account_id: string | null; ig_username: string; count_collabs: boolean }

/** Which client a row belongs to: the mapped account id first, then the Instagram username. */
function clientFor(r: RawRow, clients: ClientRef[]) {
  const acc = str(r.account_id);
  return clients.find((c) => c.windsor_account_id && c.windsor_account_id === acc)
    ?? clients.find((c) => c.ig_username.toLowerCase() === String(r.media_owner_username ?? r.username ?? '').toLowerCase());
}

export interface UpsertStats { fetched: number; upserted: number; ignored: number; unknownAccounts: string[]; deleted: number }

/**
 * Upsert rows into ig_posts (on ig_media_id). Posts seen before but missing from two consecutive
 * lookback runs are marked deleted (stories are exempt: they expire by design).
 */
export async function upsertPosts(on: Db, raw: RawRow[], opts: { stories: boolean; lookbackFrom?: string }): Promise<UpsertStats & { deletedPosts: { id: string; client_id: string }[] }> {
  const clients = await rows<ClientRef>(`select id, windsor_account_id, ig_username, count_collabs from clients where is_connected and status <> 'archived'`, [], on);
  const stats = { fetched: raw.length, upserted: 0, ignored: 0, unknownAccounts: [] as string[], deleted: 0 };
  const seen = new Set<string>();
  const clientsSeen = new Set<string>();
  for (const r of raw) {
    // the stories request also returns feed rows without a story id; those are skipped
    const mediaId = str(opts.stories ? r.story_id : r.media_id);
    const ts = str(opts.stories ? r.story_timestamp ?? r.timestamp : r.timestamp);
    if (!mediaId || !ts || Number.isNaN(Date.parse(ts))) continue;
    const client = clientFor(r, clients);
    if (!client) {
      const acc = String(r.account_id ?? r.media_owner_username ?? 'unknown');
      if (!stats.unknownAccounts.includes(acc)) stats.unknownAccounts.push(acc);
      continue;
    }
    const type = normaliseType(r.media_type ?? r.story_media_type, r.media_product_type, opts.stories);
    const relationship = str(r.media_relationship), owner = str(r.media_owner_username);
    const collab = !!relationship && relationship.toUpperCase() !== 'OWNED' || (!!owner && owner.toLowerCase() !== client.ig_username.toLowerCase());
    // a collab where the client is only co-author counts only when the client allows it
    const status = type === null || (collab && !client.count_collabs) ? 'ignored' : 'pending_review';
    if (status === 'ignored') stats.ignored++;
    seen.add(mediaId);
    clientsSeen.add(client.id);
    await on.query(
      `insert into ig_posts (client_id, ig_media_id, media_type, product_type, content_type, permalink, shortcode, thumbnail_url, posted_at,
                             caption, reach, likes, comments, saves, views, relationship, owner_username, collaborators, status, is_story, raw)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
       on conflict (ig_media_id) do update set
         caption = excluded.caption, reach = coalesce(excluded.reach, ig_posts.reach), likes = coalesce(excluded.likes, ig_posts.likes),
         comments = coalesce(excluded.comments, ig_posts.comments), saves = coalesce(excluded.saves, ig_posts.saves),
         views = coalesce(excluded.views, ig_posts.views), permalink = coalesce(excluded.permalink, ig_posts.permalink),
         thumbnail_url = coalesce(excluded.thumbnail_url, ig_posts.thumbnail_url),
         last_seen_at = now(), missed_syncs = 0, deleted_at = null, raw = excluded.raw`,
      [client.id, mediaId, str(r.media_type ?? r.story_media_type), str(r.media_product_type) ?? (opts.stories ? 'STORY' : null), type,
       str(r.media_permalink ?? r.story_permalink), str(r.media_shortcode), str(r.media_thumbnail_url), new Date(ts).toISOString(),
       str(r.media_caption), num(r.media_reach ?? r.story_reach), num(r.media_like_count), num(r.media_comments_count), num(r.media_saved),
       num(r.media_views), relationship, owner, Array.isArray(r.media_collaborators) ? r.media_collaborators.join(',') : str(r.media_collaborators),
       status, opts.stories, JSON.stringify(r)], );
    stats.upserted++;
  }

  // deletion detection for feed posts inside the lookback window; a client with no rows this run
  // (outage, empty response, unmapped account) is skipped so a blank answer never deletes anything
  let deletedPosts: { id: string; client_id: string }[] = [];
  if (!opts.stories && opts.lookbackFrom) {
    const ids = [...seen];
    await on.query(
      `update ig_posts set missed_syncs = missed_syncs + 1
        where not is_story and deleted_at is null and posted_at >= $1 and not (ig_media_id = any($2::text[]))
          and client_id = any($3::uuid[])`, [opts.lookbackFrom, ids, [...clientsSeen]]);
    deletedPosts = await rows<{ id: string; client_id: string }>(
      `update ig_posts set deleted_at = now() where not is_story and deleted_at is null and missed_syncs >= 2 returning id, client_id`, [], on);
    stats.deleted = deletedPosts.length;
  }
  return { ...stats, deletedPosts };
}

/** Lookback window for the posts job: last 14 IST days. */
export const postsWindow = () => ({ from: addDays(todayIST(), -14), to: todayIST() });
/** Stories job: today and yesterday. */
export const storiesWindow = () => ({ from: addDays(todayIST(), -1), to: todayIST() });

/** IST day of a post. */
export const postDay = (p: { posted_at: string }) => istDate(p.posted_at);

export async function lastPostTime(on: Db, clientId: string) {
  return (await row<{ t: string | null }>(`select max(posted_at) t from ig_posts where client_id = $1 and status <> 'ignored'`, [clientId], on))?.t ?? null;
}
