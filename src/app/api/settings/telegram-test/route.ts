import { z } from 'zod';
import { body, context, handler, HttpError, json, requireAdmin } from '@/lib/api';
import { sendMessage, telegramConfigured } from '@/lib/telegram';

const input = z.object({ chat_id: z.string().trim().regex(/^-?\d{5,20}$/, 'Group chat ID: a number like -1001234567890') });

/** Admin checks the bot can post in the team group before saving it. */
export const POST = handler(async (req: Request) => {
  const c = await context();
  requireAdmin(c);
  const { chat_id } = await body(req, input);
  if (!telegramConfigured()) throw new HttpError(400, 'Telegram is not set up on the server yet');
  try {
    await sendMessage(chat_id, '✅ The tracker is connected. The team’s daily tasks will be posted here each morning.');
  } catch (e) {
    throw new HttpError(400, `Telegram said: ${(e as Error).message}. Check the bot is in the group and the ID is right.`);
  }
  return json({ ok: true });
});
