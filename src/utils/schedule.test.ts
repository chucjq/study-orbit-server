import { describe, expect, it } from 'vitest';
import { schedule, type SchedulableCard } from './schedule';

const NOW = new Date('2026-10-07T15:30:00.000Z');
const fresh: SchedulableCard = { easeFactor: 2.5, intervalDays: 0, repetitions: 0, lapses: 0 };

describe('schedule (SM-2)', () => {
  it('three easy ratings give EF 2.6, 2.7, 2.8 and intervals 1, 6, 17', () => {
    const first = schedule(fresh, 'easy', NOW);
    const second = schedule(first, 'easy', NOW);
    const third = schedule(second, 'easy', NOW);

    expect([first.easeFactor, second.easeFactor, third.easeFactor]).toEqual([2.6, 2.7, 2.8]);
    expect([first.intervalDays, second.intervalDays, third.intervalDays]).toEqual([1, 6, 17]);
    expect([first.status, second.status, third.status]).toEqual(['learning', 'review', 'review']);
  });

  it('hard lowers EF by 0.14 and still advances the interval', () => {
    const result = schedule(fresh, 'hard', NOW);
    expect(result.easeFactor).toBe(2.36);
    expect(result.repetitions).toBe(1);
    expect(result.intervalDays).toBe(1);
  });

  it('good keeps EF unchanged', () => {
    expect(schedule(fresh, 'good', NOW).easeFactor).toBe(2.5);
  });

  it('again resets repetitions, keeps EF, counts a lapse and is due tomorrow', () => {
    const card: SchedulableCard = { easeFactor: 2.7, intervalDays: 17, repetitions: 3, lapses: 1 };
    const result = schedule(card, 'again', NOW);
    expect(result).toMatchObject({
      easeFactor: 2.7,
      intervalDays: 1,
      repetitions: 0,
      lapses: 2,
      status: 'learning',
    });
    expect(result.dueDate.toISOString()).toBe('2026-10-08T00:00:00.000Z');
  });

  it('EF never drops below 1.3', () => {
    const card: SchedulableCard = { easeFactor: 1.3, intervalDays: 6, repetitions: 2, lapses: 0 };
    expect(schedule(card, 'hard', NOW).easeFactor).toBe(1.3);
  });

  it('status becomes mastered at interval >= 21 and stays review below it', () => {
    const card: SchedulableCard = { easeFactor: 2.8, intervalDays: 17, repetitions: 3, lapses: 0 };
    const mastered = schedule(card, 'easy', NOW);
    expect(mastered.intervalDays).toBe(49);
    expect(mastered.status).toBe('mastered');

    const lower: SchedulableCard = { easeFactor: 1.3, intervalDays: 6, repetitions: 2, lapses: 0 };
    const review = schedule(lower, 'good', NOW);
    expect(review.intervalDays).toBe(8);
    expect(review.status).toBe('review');
  });

  it('dueDate is the start of the current UTC day plus the interval', () => {
    const result = schedule({ ...fresh, repetitions: 1, intervalDays: 1 }, 'good', NOW);
    expect(result.intervalDays).toBe(6);
    expect(result.dueDate.toISOString()).toBe('2026-10-13T00:00:00.000Z');
  });

  it('does not mutate its input', () => {
    const card: SchedulableCard = { ...fresh };
    schedule(card, 'easy', NOW);
    expect(card).toEqual(fresh);
  });
});
