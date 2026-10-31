// Telegram delivery (developer brief §7): send, de-duplicate, respect quiet hours, log every message.
import { assertClientSafe, CopyGuardError } from './copyGuard';
import { istTime } from './dates';
import { row, rows, type Db } from './db';

export interface Button { text: string; data?: string; url?: string }
export interface Settings {
  digest_enabled: boolean; nudge_enabled: boolean; overdue_enabled: boolean; inactivity_enabled: boolean;
  quiet_hours_enabled: boolean; quiet_start: string; quiet_end: string; digest_time: string; banned_terms: string[];
  team_group_chat_id: string | null; digest_target: 'personal' | 'group' | 'both'; task_cards_enabled: boolean;
}

export const getSettings = async (on?: Db) => (await row<Settings>(`select * from app_settings where id = 1`, [], on))!;
export const telegramConfigured = () => !!process.env.TELEGRAM_BOT_TOKEN;
export const webhookEnabled = () => process.env.TELEGRAM_WEBHOOK_ENABLED === 'true';

export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** True when the IST time falls in quiet hours (handles ranges over midnight, e.g. 22:00–08:00). */
export function inQuietHours(now: string, start: string, end: string) {
  const [n, s, e] = [now, start, end].map((t) => t.slice(0, 5));
  return s <= e ? n >= s && n < e : n >= s || n < e;
}

// ~20 messages a second at most
let nextSlot = 0;
async function throttle() {
  const wait = Math.max(0, nextSlot - Date.now());
  nextSlot = Math.max(Date.now(), nextSlot) + 50;
  if (wait) await new Promise((r) => setTimeout(r, wait));
}

export async function callTelegram<T = unknown>(method: string, payload: Record<string, unknown>, fetcher: typeof fetch = fetch): Promise<T> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('Telegram is not set up (TELEGRAM_BOT_TOKEN missing)');
  await throttle();
  const base = process.env.TELEGRAM_API_BASE || 'https://api.telegram.org';
  const res = await fetcher(`${base}/bot${token}/${method}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
  const body = await res.json().catch(() => ({})) as { ok?: boolean; result?: T; description?: string };
  if (!body.ok) throw new Error(body.description || `Telegram error ${res.status}`);
  return body.result as T;
}

const keyboard = (buttons?: Button[][]) => (buttons?.length
  ? { inline_keyboard: buttons.map((r) => r.map((b) => (b.url ? { text: b.text, url: b.url } : { text: b.text, callback_data: b.data }))) } : undefined);

export async function sendMessage(chatId: number | string, html: string, buttons?: Button[][], fetcher?: typeof fetch) {
  const markup = keyboard(buttons);
  const r = await callTelegram<{ message_id: number }>('sendMessage', {
    chat_id: chatId, text: html, parse_mode: 'HTML', disable_web_page_preview: true, ...(markup ? { reply_markup: markup } : {}),
  }, fetcher);
  return r.message_id;
}

/** Redraw a message we sent (text and buttons), e.g. a task card after a stage button is tapped. */
export async function editMessage(chatId: number | string, messageId: number, html: string, buttons?: Button[][], fetcher?: typeof fetch) {
  await callTelegram('editMessageText', {
    chat_id: chatId, message_id: messageId, text: html, parse_mode: 'HTML', disable_web_page_preview: true,
    reply_markup: keyboard(buttons) ?? { inline_keyboard: [] },
  }, fetcher);
}

export interface Notice {
  staffId: string; kind: string; dedupeKey: string; text: string;
  taskId?: string | null; clientId?: string | null; buttons?: Button[][];
  /** Allowed during quiet hours (e.g. a nudge for a task due before 10:00). */
  urgent?: boolean;
}
export type NoticeResult = 'sent' | 'duplicate' | 'held' | 'not_linked' | 'blocked' | 'failed' | 'disabled';

/**
 * Send one notice. Each dedupe key is sent at most once. During quiet hours non-urgent notices are
 * held (not recorded) so the next run after quiet hours sends them. Blocked and failed sends are logged.
 */
export async function notify(on: Db, n: Notice, settings: Settings, opts: { now?: Date; fetcher?: typeof fetch } = {}): Promise<NoticeResult> {
  if (await row(`select 1 from notifications where dedupe_key = $1`, [n.dedupeKey], on)) return 'duplicate';
  if (settings.quiet_hours_enabled && !n.urgent && inQuietHours(istTime(opts.now ?? new Date()), settings.quiet_start, settings.quiet_end)) return 'held';

  const log = (error: string | null, messageId: number | null = null) => on.query(
    `insert into notifications (staff_id, kind, task_id, client_id, dedupe_key, text, telegram_message_id, sent_at, error)
     values ($1, $2, $3, $4, $5, $6, $7, case when $8::text is null then now() end, $8) on conflict (dedupe_key) do nothing`,
    [n.staffId, n.kind, n.taskId ?? null, n.clientId ?? null, n.dedupeKey, n.text, messageId, error]);

  try {
    assertClientSafe(n.text + ' ' + (n.buttons ?? []).flat().map((b) => b.text).join(' '), settings.banned_terms);
  } catch (e) {
    await log((e as CopyGuardError).message);
    return 'blocked';
  }
  const staff = await row<{ telegram_chat_id: string | null; is_active: boolean }>(`select telegram_chat_id, is_active from staff where id = $1`, [n.staffId], on);
  if (!staff?.telegram_chat_id) { await log('Telegram not linked'); return 'not_linked'; }
  if (!telegramConfigured()) { await log('Telegram is not set up on the server'); return 'disabled'; }
  try {
    const id = await sendMessage(staff.telegram_chat_id, n.text, n.buttons, opts.fetcher);
    await log(null, id);
    return 'sent';
  } catch (e) {
    await log(`Send failed: ${(e as Error).message}`);
    return 'failed';
  }
}

/** Like notify, but to a group chat (the team group) rather than one teammate. */
export async function notifyChat(on: Db, chatId: string, n: Omit<Notice, 'staffId'>, settings: Settings, opts: { now?: Date; fetcher?: typeof fetch } = {}): Promise<NoticeResult> {
  if (await row(`select 1 from notifications where dedupe_key = $1`, [n.dedupeKey], on)) return 'duplicate';
  if (settings.quiet_hours_enabled && !n.urgent && inQuietHours(istTime(opts.now ?? new Date()), settings.quiet_start, settings.quiet_end)) return 'held';

  const log = (error: string | null, messageId: number | null = null) => on.query(
    `insert into notifications (staff_id, kind, task_id, client_id, dedupe_key, text, telegram_message_id, sent_at, error)
     values (null, $1, $2, $3, $4, $5, $6, case when $7::text is null then now() end, $7) on conflict (dedupe_key) do nothing`,
    [n.kind, n.taskId ?? null, n.clientId ?? null, n.dedupeKey, n.text, messageId, error]);

  try {
    assertClientSafe(n.text + ' ' + (n.buttons ?? []).flat().map((b) => b.text).join(' '), settings.banned_terms);
  } catch (e) {
    await log((e as CopyGuardError).message);
    return 'blocked';
  }
  if (!telegramConfigured()) { await log('Telegram is not set up on the server'); return 'disabled'; }
  try {
    const id = await sendMessage(chatId, n.text, n.buttons, opts.fetcher);
    await log(null, id);
    return 'sent';
  } catch (e) {
    await log(`Send failed: ${(e as Error).message}`);
    return 'failed';
  }
}

export async function leadsAndAdmins(on: Db) {
  return rows<{ id: string; name: string; role: string }>(`select id, name, role from staff where is_active and role in ('admin', 'lead')`, [], on);
}

export async function notifyAssignment(on: Db, taskId: string, assignerId: string, assigneeId: string) {
  if (!telegramConfigured()) return;
  const staff = await row<{ name: string; telegram_chat_id: string | null }>(`select name, telegram_chat_id from staff where id = $1 and is_active`, [assigneeId], on);
  if (!staff?.telegram_chat_id) return;
  const assigner = await row<{ name: string }>(`select name from staff where id = $1`, [assignerId], on);
  const task = await row<{ title: string; client: string; due_at: string }>(
    `select t.title, c.name as client, t.due_at from tasks t join clients c on c.id = t.client_id where t.id = $1`, [taskId], on);
  if (!task) return;
  const appUrl = process.env.APP_URL ? `${process.env.APP_URL.replace(/\/$/, '')}/tasks?task=${taskId}` : null;
  const text = `📌 <b>New task assigned by ${esc(assigner?.name ?? 'Lead')}:</b>\n` +
    `• <b>Client:</b> ${esc(task.client)}\n` +
    `• <b>Deliverable:</b> “${esc(task.title)}”\n` +
    `• <b>Due:</b> ${istTime(task.due_at)} IST`;
  const buttons: Button[][] = [[
    { text: '▶️ Start Designing', data: `stg:${taskId}:designing` },
    ...(appUrl ? [{ text: 'Open task', url: appUrl }] : [])
  ]];
  try {
    await sendMessage(staff.telegram_chat_id, text, buttons);
  } catch (e) {
    console.error('Failed to notify assignment:', e);
  }
}
