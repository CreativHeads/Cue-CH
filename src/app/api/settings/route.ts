import { z } from 'zod';
import { body, context, handler, HttpError, json, requireAdmin } from '@/lib/api';
import { DEFAULT_BANNED } from '@/lib/copyGuard';
import { row, setClause } from '@/lib/db';
import { time } from '@/lib/schemas';

const COLS = ['digest_enabled', 'nudge_enabled', 'overdue_enabled', 'inactivity_enabled', 'quiet_hours_enabled', 'quiet_start', 'quiet_end', 'digest_time', 'banned_terms'] as const;
const patch = z.object({
  digest_enabled: z.boolean(), nudge_enabled: z.boolean(), overdue_enabled: z.boolean(), inactivity_enabled: z.boolean(),
  quiet_hours_enabled: z.boolean(), quiet_start: time, quiet_end: time, digest_time: time,
  banned_terms: z.array(z.string().trim().toLowerCase().min(2).max(40)).max(100),
}).partial();

export const GET = handler(async () => {
  await context();
  const s = await row<Record<string, unknown>>(`select * from app_settings where id = 1`);
  return json({ ...s, default_banned: DEFAULT_BANNED, telegram_bot: process.env.TELEGRAM_BOT_USERNAME ?? null });
});

export const PATCH = handler(async (req: Request) => {
  const c = await context();
  requireAdmin(c);
  const set = setClause(await body(req, patch), COLS);
  if (!set.sql) throw new HttpError(400, 'Nothing to update');
  return json(await row(`update app_settings set ${set.sql} where id = 1 returning *`, set.params));
});
