import { describe, expect, it } from 'vitest';
import { utcDayKey } from './dates';
import { currentStreak, longestStreak } from './streak';

// Thursday 2026-10-08, afternoon UTC.
const NOW = new Date('2026-10-08T15:00:00.000Z');

describe('utcDayKey', () => {
  it('gives the UTC calendar day as YYYY-MM-DD', () => {
    expect(utcDayKey(new Date('2026-10-08T23:59:59.999Z'))).toBe('2026-10-08');
    expect(utcDayKey(new Date('2026-10-08T00:00:00.000Z'))).toBe('2026-10-08');
  });
});

describe('currentStreak', () => {
  it('counts back from today when there is a review today', () => {
    expect(currentStreak(['2026-10-08', '2026-10-07', '2026-10-06'], NOW)).toBe(3);
  });

  it('starts from yesterday when there is no review yet today', () => {
    expect(currentStreak(['2026-10-07', '2026-10-06'], NOW)).toBe(2);
  });

  it('counts only the reviewed-yesterday run when it reviewed yesterday only', () => {
    expect(currentStreak(['2026-10-07'], NOW)).toBe(1);
  });

  it('stops at a gap', () => {
    expect(currentStreak(['2026-10-08', '2026-10-06', '2026-10-05'], NOW)).toBe(1);
  });

  it('is 0 when the latest review is older than yesterday', () => {
    expect(currentStreak(['2026-10-06', '2026-10-05'], NOW)).toBe(0);
  });

  it('is 0 when there are no reviews', () => {
    expect(currentStreak([], NOW)).toBe(0);
  });

  it('crosses month boundaries', () => {
    const endOfSeptember = new Date('2026-10-01T10:00:00.000Z');
    expect(currentStreak(['2026-10-01', '2026-09-30', '2026-09-29'], endOfSeptember)).toBe(3);
  });

  it('ignores duplicate day keys', () => {
    expect(currentStreak(['2026-10-08', '2026-10-08', '2026-10-07'], NOW)).toBe(2);
  });
});

describe('longestStreak', () => {
  it('is 0 when there are no reviews', () => {
    expect(longestStreak([])).toBe(0);
  });

  it('finds the longest run anywhere in the history', () => {
    const days = ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-10', '2026-09-11', '2026-10-08'];
    expect(longestStreak(days)).toBe(3);
  });

  it('does not depend on input order or duplicates', () => {
    expect(longestStreak(['2026-10-03', '2026-10-01', '2026-10-02', '2026-10-02'])).toBe(3);
  });

  it('counts a run across a month boundary', () => {
    expect(longestStreak(['2026-09-30', '2026-10-01', '2026-10-02'])).toBe(3);
  });
});
