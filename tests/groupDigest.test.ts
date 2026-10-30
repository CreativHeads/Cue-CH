import { describe, expect, it } from 'vitest';
import { groupDigestText, type TaskRow } from '../src/lib/jobs';

const t = (owner: string | null, client: string, type: TaskRow['content_type'], due: string, title: string, stage: TaskRow['stage'], priority = 'normal'): TaskRow =>
  ({ id: title, title, client_id: 'c', client, content_type: type, due_at: due, stage, owner_id: owner, priority, carried_over_from: null, delivery: null });
const names = { b: 'Basil', r: 'Raheesha' };

describe('groupDigestText', () => {
  it('lists today’s tasks under each person, unassigned last, then overdue', () => {
    const text = groupDigestText('2026-10-30', [
      t('r', 'Dentcom', 'poster', '2026-10-30T12:30:00Z', 'Smile week poster', 'designing'),
      t('b', 'Dentcom', 'special_days_poster', '2026-10-30T12:30:00Z', 'Kerala Piravi wish', 'to_brief', 'high'),
      t('b', 'Level8', 'reel', '2026-10-30T09:30:00Z', 'Behind the scenes', 'client_review'),
      t(null, 'Level8', 'story', '2026-10-30T13:30:00Z', 'Story frame', 'to_brief'),
    ], [t('r', 'Dentcom', 'carousel', '2026-10-28T12:30:00Z', 'Tips carousel', 'designing')], names);
    expect(text).toContain('Today’s tasks · Fri, 30 Oct');
    expect(text.indexOf('Basil')).toBeLessThan(text.indexOf('Raheesha'));
    expect(text.indexOf('Raheesha')).toBeLessThan(text.indexOf('Unassigned'));
    expect(text).toContain('6:00 PM · Dentcom · Special Days Poster · 🔺 High');
    expect(text).toContain('Overdue</b> (1)');
    expect(text).toContain('Raheesha: Dentcom carousel, due 28 Oct');
  });
  it('says so when nothing is due', () => {
    expect(groupDigestText('2026-11-01', [], [], names)).toContain('Nothing due today.');
  });
});
