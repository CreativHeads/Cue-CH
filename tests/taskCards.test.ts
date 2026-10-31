import { describe, expect, it } from 'vitest';
import { cardButtons, cardText, type CardTask } from '../src/lib/taskCards';

const task = (stage: CardTask['stage']): CardTask => ({
  id: '11111111-1111-1111-1111-111111111111', title: 'Smile week poster', client: 'Dentcom', content_type: 'poster',
  due_at: '2026-10-31T12:30:00Z', stage, brief: 'Bright, friendly, logo bottom right', priority: 'normal',
});
const labels = (stage: CardTask['stage']) => cardButtons(task(stage)).flat().map((b) => b.text);

describe('task cards', () => {
  it('walks Start designing → Design completed → Client approved → Posted', () => {
    expect(labels('to_brief')).toEqual(['🎨 Start designing']);
    expect(labels('designing')).toEqual(['✅ Design completed']);
    expect(labels('client_review')).toEqual(['👍 Client approved', '✏️ Changes needed']);
    expect(labels('approved')).toEqual(['📢 Posted']);
    expect(labels('posted')).toEqual([]);
  });
  it('button data moves the task to the next stage and fits Telegram’s 64-byte limit', () => {
    const b = cardButtons(task('designing')).flat()[0];
    expect(b.data).toBe('stg:11111111-1111-1111-1111-111111111111:client_review');
    expect(Buffer.byteLength(b.data!)).toBeLessThanOrEqual(64);
  });
  it('adds an Open task link when the app URL is known', () => {
    expect(cardButtons(task('to_brief'), 'https://cue.creativheads.com/').at(-1)).toEqual([
      { text: 'Open task', url: 'https://cue.creativheads.com/tasks?task=11111111-1111-1111-1111-111111111111' }]);
  });
  it('shows client, type, time, brief and stage', () => {
    const text = cardText(task('to_brief'), '2026-10-31');
    expect(text).toContain('Dentcom · Poster');
    expect(text).toContain('Today, 6:00 PM');
    expect(text).toContain('Bright, friendly');
    expect(text).toContain('Stage: <b>To brief</b>');
  });
});
