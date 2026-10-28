// Plan → dated tasks (developer brief §4). Pure functions; the API applies the result.
import { addDays, daysInMonth, dow, DOWS, istDate, istTime, mondayOf, monthDays, toDueAt, ymOf } from './dates';
import { TYPE_LABEL, type ContentType, type Frequency, type PlanItem } from './types';

const allowed = (f: { days: string[] }, d: string) => f.days.includes(DOWS[dow(d)]);

/** Candidate dates for one plan line, before reconciling with monthly_count. */
export function candidateDates(freq: Frequency, monthlyCount: number, ym: string): string[] {
  const all = monthDays(ym);
  const n = all.length;
  switch (freq.mode) {
    case 'weekdays':
      return all.filter((d) => allowed(freq, d));
    case 'dates':
      return [...new Set(freq.dates.filter((d) => ymOf(d) === ym))].sort();
    case 'per_week': {
      // For each Monday–Sunday week, prorate the count by how many allowed days fall in this month.
      const out: string[] = [];
      const perWeekDays = freq.days.length || 1;
      for (let wk = mondayOf(all[0]); wk <= all[n - 1]; wk = addDays(wk, 7)) {
        const inWeek: string[] = [];
        for (let i = 0; i < 7; i++) {
          const d = addDays(wk, i);
          if (ymOf(d) === ym && allowed(freq, d)) inWeek.push(d);
        }
        const k = Math.min(inWeek.length, Math.round((freq.count * inWeek.length) / perWeekDays));
        for (let i = 0; i < k; i++) out.push(inWeek[Math.min(inWeek.length - 1, Math.round(((i + 0.5) * inWeek.length) / k - 0.5))]);
      }
      return [...new Set(out)];
    }
    case 'spread': {
      const c = Math.max(0, monthlyCount);
      const step = n / (c || 1);
      return Array.from({ length: c }, (_, i) => all[Math.min(n - 1, Math.floor(i * step + step / 2))]);
    }
  }
}

/** Reconcile candidates with the target count. Never fails silently: mismatches return a warning. */
export function itemDates(item: Pick<PlanItem, 'frequency' | 'monthly_count'>, ym: string): { dates: string[]; warning: string | null } {
  let dates = candidateDates(item.frequency, item.monthly_count, ym);
  const f = item.frequency;
  if (f.mode !== 'weekdays') return { dates, warning: null }; // per_week/dates define their own count; spread is exact
  const target = item.monthly_count;
  if (dates.length > target) {
    // drop dates evenly so the remaining ones stay spread across the month
    if (target <= 0) dates = [];
    else if (target === 1) dates = [dates[0]];
    else {
      const keep = new Set(Array.from({ length: target }, (_, i) => Math.round((i * (dates.length - 1)) / (target - 1))));
      dates = dates.filter((_, i) => keep.has(i));
    }
    return { dates, warning: null };
  }
  if (dates.length < target) {
    // add the nearest free days to the allowed ones, then warn about whatever still doesn't fit
    const all = monthDays(ym);
    const taken = new Set(dates);
    const free = all.filter((d) => !taken.has(d));
    const dist = (d: string) => {
      for (let o = 1; o <= 3; o++) if (allowed(f, addDays(d, o)) || allowed(f, addDays(d, -o))) return o;
      return 9;
    };
    const extra = free.sort((a, b) => dist(a) - dist(b) || a.localeCompare(b)).slice(0, target - dates.length);
    const filled = [...dates, ...extra].sort();
    const warning = f.days.length === 0
      ? `Pick at least one weekday.`
      : `Only ${dates.length} ${f.days.join('/')} dates fall in this month; ${extra.length} nearby day${extra.length === 1 ? '' : 's'} added to reach ${target}.`;
    return { dates: filled, warning };
  }
  return { dates, warning: null };
}

export interface ExistingTask {
  id: string; plan_item_id: string | null; seq: number | null; stage: string; posted_at: string | null;
  due_at: string; owner_id: string | null; content_type: ContentType; has_notes?: boolean;
}
export interface TaskInsert {
  client_id: string; plan_item_id: string; seq: number; content_type: ContentType; due_at: string;
  owner_id: string | null; stage: 'to_brief'; title: string; brief: string;
}
export interface GenerationResult {
  creates: TaskInsert[];
  updates: { id: string; patch: { due_at: string; owner_id: string | null; content_type: ContentType } }[];
  deletes: string[];
  kept: number;
  warnings: string[];
  preview: Record<string, ContentType[]>;
}

/** A task the generator may still move or remove: not started, not posted, not in the past, no notes. */
export const isUntouched = (t: ExistingTask, today: string) =>
  t.stage === 'to_brief' && !t.posted_at && istDate(t.due_at) >= today && !t.has_notes;

/**
 * Idempotent generation: upsert on (plan_item_id, seq).
 * Tasks already past to_brief, posted, or in the past are never moved or deleted.
 */
export function planGeneration(opts: {
  clientId: string; clientName: string; month: string; items: PlanItem[]; existing: ExistingTask[]; today: string;
}): GenerationResult {
  const res: GenerationResult = { creates: [], updates: [], deletes: [], kept: 0, warnings: [], preview: {} };
  for (const item of opts.items) {
    const { dates, warning } = itemDates(item, opts.month);
    if (warning) res.warnings.push(`${TYPE_LABEL[item.content_type]}: ${warning}`);
    const time = item.posting_time.slice(0, 5);
    const mine = opts.existing.filter((t) => t.plan_item_id === item.id);
    dates.forEach((d, i) => {
      (res.preview[d] ||= []).push(item.content_type);
      const seq = i + 1;
      const dueAt = toDueAt(d, time);
      const t = mine.find((x) => x.seq === seq);
      if (!t) {
        const label = item.label || `${opts.clientName.split(' ')[0]} ${TYPE_LABEL[item.content_type].toLowerCase()}`;
        res.creates.push({
          client_id: opts.clientId, plan_item_id: item.id, seq, content_type: item.content_type, due_at: dueAt,
          owner_id: item.owner_id, stage: 'to_brief', title: `${label} ${seq}`,
          brief: `Create a ${TYPE_LABEL[item.content_type].toLowerCase()} for ${opts.clientName}.`,
        });
      } else if (isUntouched(t, opts.today)) {
        const same = istDate(t.due_at) === d && istTime(t.due_at) === time && t.owner_id === item.owner_id && t.content_type === item.content_type;
        if (!same) res.updates.push({ id: t.id, patch: { due_at: dueAt, owner_id: item.owner_id, content_type: item.content_type } });
        else res.kept++;
      } else res.kept++;
    });
    mine.filter((t) => (t.seq ?? 0) > dates.length && isUntouched(t, opts.today)).forEach((t) => res.deletes.push(t.id));
  }
  return res;
}

export const monthCount = (item: Pick<PlanItem, 'frequency' | 'monthly_count'>, ym: string) => itemDates(item, ym).dates.length;
export const firstOfMonth = (ym: string) => `${ym}-01`;
export const lastOfMonth = (ym: string) => `${ym}-${String(daysInMonth(ym)).padStart(2, '0')}`;
