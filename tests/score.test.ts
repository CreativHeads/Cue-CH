import { describe, expect, it } from 'vitest';
import { band, deliveryScore, scoreParts, taskDot } from '@/lib/score';
import { toDueAt } from '@/lib/dates';

const t = (date: string, stage: string, delivery: string | null = null) =>
  ({ due_at: toDueAt(date, '19:00'), stage, delivery }) as never;

describe('delivery score', () => {
  it('applies the brief formula and caps at 100', () => {
    expect(deliveryScore({ planned: 10, onTime: 8, late: 1, manual: 0, missed: 1, extra: 3 })).toBeCloseTo(85);
    expect(deliveryScore({ planned: 4, onTime: 2, late: 0, manual: 2, missed: 0, extra: 0 })).toBeCloseTo(87.5);
    expect(deliveryScore({ planned: 0, onTime: 0, late: 0, manual: 0, missed: 0, extra: 0 })).toBeNull();
  });

  it('month-to-date ignores future and not-yet-posted today tasks', () => {
    const tasks = [t('2026-10-01', 'posted', 'on_time'), t('2026-10-02', 'designing'), t('2026-10-28', 'approved'), t('2026-10-28', 'posted', 'late'), t('2026-10-30', 'to_brief')];
    const p = scoreParts(tasks, 0, '2026-10-28');
    expect(p.planned).toBe(3);
    expect(p.missed).toBe(1);
    expect(deliveryScore(p)).toBeCloseTo(50);
  });

  it('bands', () => {
    expect(band(96)).toBe('green');
    expect(band(85)).toBe('amber');
    expect(band(60)).toBe('red');
  });

  it('grid dots: posted, due, missed', () => {
    expect(taskDot(t('2026-10-20', 'posted'), '2026-10-28')).toBe('posted');
    expect(taskDot(t('2026-10-20', 'designing'), '2026-10-28')).toBe('missed');
    expect(taskDot(t('2026-10-28', 'designing'), '2026-10-28')).toBe('due');
  });
});
