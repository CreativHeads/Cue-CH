// Personal Telegram "task card": one message per task on its day, with a button for the next step.
// Tapping a button moves the task (Telegram webhook) and the same message is redrawn with the next step.
import { fmtD, fmtT, istDate, istTime } from './dates';
import { esc, type Button } from './telegram';
import { STAGE_LABEL, TYPE_LABEL, type ContentType, type Stage } from './types';

export interface CardTask {
  id: string; title: string; client: string; content_type: ContentType; due_at: string; stage: Stage; brief: string | null; priority: string;
}

/** The next step from each stage: Start designing → Design completed → Client approved → Posted. */
const NEXT: Partial<Record<Stage, { to: Stage; text: string }[]>> = {
  to_brief: [{ to: 'designing', text: '🎨 Start designing' }],
  designing: [{ to: 'client_review', text: '✅ Design completed' }],
  client_review: [{ to: 'approved', text: '👍 Client approved' }, { to: 'designing', text: '✏️ Changes needed' }],
  approved: [{ to: 'posted', text: '📢 Posted' }],
  scheduled: [{ to: 'posted', text: '📢 Posted' }],
};

export function cardButtons(t: Pick<CardTask, 'id' | 'stage'>, appUrl?: string | null): Button[][] {
  const steps = (NEXT[t.stage] ?? []).map((s) => ({ text: s.text, data: `stg:${t.id}:${s.to}` }));
  const open = appUrl ? [{ text: 'Open task', url: `${appUrl.replace(/\/$/, '')}/tasks?task=${t.id}` }] : [];
  return [...(steps.length ? [steps] : []), ...(open.length ? [open] : [])];
}

export function cardText(t: CardTask, today = istDate(new Date())) {
  const day = istDate(t.due_at) === today ? 'Today' : fmtD(istDate(t.due_at));
  const brief = t.brief?.trim();
  const lines = [
    `📌 <b>${esc(t.client)} · ${TYPE_LABEL[t.content_type]}</b>${t.priority === 'high' ? ' · 🔺 High' : ''}`,
    `“${esc(t.title)}”`,
    `🕕 ${day}, ${fmtT(istTime(t.due_at))}`,
    ...(brief ? [`📝 ${esc(brief.length > 300 ? `${brief.slice(0, 300)}…` : brief)}`] : []),
    '',
    `Stage: <b>${STAGE_LABEL[t.stage]}</b>`,
  ];
  if (t.stage === 'posted') lines.push('🎉 Posted. Nice work.');
  return lines.join('\n');
}
