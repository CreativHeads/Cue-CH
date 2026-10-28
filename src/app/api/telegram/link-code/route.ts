import { randomBytes } from 'node:crypto';
import { context, handler, HttpError, json } from '@/lib/api';
import { rows } from '@/lib/db';
import { webhookEnabled } from '@/lib/telegram';

/** One-time code for linking your Telegram: open t.me/<bot>?start=<code> and press Start. Valid for 30 minutes. */
export const POST = handler(async () => {
  const c = await context();
  const bot = process.env.TELEGRAM_BOT_USERNAME;
  if (!bot || !webhookEnabled()) throw new HttpError(409, 'Self-linking needs the tracker’s own bot. Ask the admin to add your Telegram chat ID on the Team screen.');
  const code = randomBytes(12).toString('base64url');
  await rows(`delete from telegram_link_codes where staff_id = $1 or expires_at < now()`, [c.me.id]);
  await rows(`insert into telegram_link_codes (code, staff_id, expires_at) values ($1, $2, now() + interval '30 minutes')`, [code, c.me.id]);
  return json({ url: `https://t.me/${bot.replace(/^@/, '')}?start=${code}` });
});
