// Delivery score (brief §10) and dashboard cell states (§9).
import { istDate } from './dates';
import type { Task } from './types';

export interface ScoreParts { planned: number; onTime: number; late: number; manual: number; missed: number; extra: number }

export function deliveryScore(p: ScoreParts): number | null {
  if (!p.planned) return null;
  return Math.min(100, ((p.onTime + 0.5 * p.late + 0.75 * p.manual) / p.planned) * 100);
}

/** Month-to-date when `upto` is given: tasks due before today, plus today's tasks already posted. */
export function scoreParts(tasks: Pick<Task, 'due_at' | 'stage' | 'delivery'>[], extras: number, upto?: string): ScoreParts {
  const counted = tasks.filter((t) => {
    if (!upto) return true;
    const d = istDate(t.due_at);
    return d < upto || (d === upto && t.stage === 'posted');
  });
  return {
    planned: counted.length,
    onTime: counted.filter((t) => t.delivery === 'on_time').length,
    late: counted.filter((t) => t.delivery === 'late').length,
    manual: counted.filter((t) => t.delivery === 'manual_unverified').length,
    missed: counted.filter((t) => t.stage !== 'posted').length,
    extra: extras,
  };
}

export const band = (s: number | null) => (s == null ? 'none' : s >= 95 ? 'green' : s >= 80 ? 'amber' : 'red');
export const bandLabel = (s: number | null) => (s == null ? '—' : s >= 95 ? 'On track' : s >= 80 ? 'Slipping' : 'Behind');

export type Dot = 'posted' | 'due' | 'missed' | 'extra';
export const taskDot = (t: Pick<Task, 'due_at' | 'stage'>, today: string): Dot =>
  t.stage === 'posted' ? 'posted' : istDate(t.due_at) < today ? 'missed' : 'due';
