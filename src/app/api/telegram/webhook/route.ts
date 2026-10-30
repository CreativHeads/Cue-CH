import { NextResponse } from 'next/server';
import { db, row } from '@/lib/db';
import { HttpError } from '@/lib/errors';
import { secretMatches } from '@/lib/secret';
import { updateTask } from '@/lib/tasks';
import { callTelegram, esc, leadsAndAdmins, sendMessage, webhookEnabled } from '@/lib/telegram';
import { STAGES, STAGE_LABEL, type Stage } from '@/lib/types';

const ok = () => NextResponse.json({ ok: true });

/**
 * Telegram updates for the tracker's own bot: /start <code> links a teammate;
 * stg:<task>:<stage> buttons move a task. Only the task owner or a lead/admin may tap.
 */
export async function POST(req: Request) {
  if (!webhookEnabled() || !secretMatches(req.headers.get('x-telegram-bot-api-secret-token'), process.env.TELEGRAM_WEBHOOK_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const update = await req.json().catch(() => null) as {
    message?: { chat: { id: number }; text?: string };
    callback_query?: { id: string; from: { id: number }; data?: string };
  } | null;
  if (!update) return ok();

  try {
    const text = update.message?.text?.trim();
    if (update.message && text?.startsWith('/start')) {
      const code = text.split(/\s+/)[1];
      const chat = update.message.chat.id;
      const link = code ? await row<{ staff_id: string }>(`delete from telegram_link_codes where code = $1 and expires_at > now() returning staff_id`, [code]) : null;
      if (!link) {
        const who = await row<{ name: string }>(`select name from staff where telegram_chat_id = $1 and is_active`, [chat]);
        if (who) {
          await sendMessage(chat, `👋 Hi ${who.name}! You are connected to Cue. Your daily tasks and reminders will arrive here.`);
          return ok();
        }
        await sendMessage(chat, code ? 'That link has expired. Open Settings in the tracker and press “Connect Telegram” again.' : 'Hi! To link your Telegram account, open Settings in Cue and click “Connect Telegram”.');
        return ok();
      }
      await db().query(`update staff set telegram_chat_id = null where telegram_chat_id = $1`, [chat]);
      const s = await row<{ name: string }>(`update staff set telegram_chat_id = $2 where id = $1 returning name`, [link.staff_id, chat]);
      await sendMessage(chat, `✅ Connected. Hi ${s?.name ?? ''}, you’ll get your reminders here.`);
      return ok();
    }

    const cb = update.callback_query;
    if (cb?.data?.startsWith('stg:')) {
      const [, taskId, stage] = cb.data.split(':');
      const answer = (t: string) => callTelegram('answerCallbackQuery', { callback_query_id: cb.id, text: t });
      const who = await row<{ id: string; role: string; name: string }>(`select id, role, name from staff where telegram_chat_id = $1 and is_active`, [cb.from.id]);
      if (!who) { await answer('This Telegram account isn’t linked to the tracker.'); return ok(); }
      if (!(STAGES as readonly string[]).includes(stage) || stage === 'posted') { await answer('Unknown action.'); return ok(); }
      try {
        await updateTask(db(), { id: who.id, isLead: who.role === 'admin' || who.role === 'lead' }, taskId, { stage: stage as Stage });
        await answer(`Moved to ${STAGE_LABEL[stage as Stage]}`);
        if (stage === 'client_review' && who.role !== 'lead' && who.role !== 'admin') {
          const lead = (await leadsAndAdmins(db())).find((l) => l.role === 'lead');
          if (lead) {
            const leadStaff = await row<{ telegram_chat_id: string | null }>(`select telegram_chat_id from staff where id = $1`, [lead.id], db());
            const task = await row<{ title: string; client: string }>(`select t.title, c.name as client from tasks t join clients c on c.id = t.client_id where t.id = $1`, [taskId], db());
            if (leadStaff?.telegram_chat_id && task) {
              const url = process.env.APP_URL ? `${process.env.APP_URL.replace(/\/$/, '')}/tasks?task=${taskId}` : null;
              await sendMessage(leadStaff.telegram_chat_id,
                `🎨 <b>Designer Finished!</b>\n` +
                `<b>${esc(who.name)}</b> finished design for <b>${esc(task.client)}</b> — “${esc(task.title)}”!\n` +
                `Ready for your review and client approval.`,
                [[{ text: 'Mark Approved', data: `stg:${taskId}:approved` }, ...(url ? [{ text: 'Open Task', url }] : [])]]
              ).catch(() => null);
            }
          }
        }
      } catch (e) {
        await answer(e instanceof HttpError && e.status === 403 ? 'Only the owner or the lead can change this task.' : 'Couldn’t update the task.');
      }
    }
  } catch (e) {
    console.error('telegram webhook', e);
  }
  return ok();
}
