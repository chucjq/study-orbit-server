import { addUtcDays, utcDayKey } from './dates';

/** The `YYYY-MM-DD` key `days` UTC days away from `key`. */
function shiftKey(key: string, days: number): string {
  return utcDayKey(addUtcDays(new Date(`${key}T00:00:00.000Z`), days));
}

/**
 * Consecutive UTC days with a review, counting back from today. If there is no review yet
 * today, the count starts from yesterday, so the streak only resets after a full missed day.
 * 0 when the latest review is older than yesterday or there are no reviews.
 */
export function currentStreak(dayKeys: Iterable<string>, now: Date): number {
  const days = new Set(dayKeys);
  const today = utcDayKey(now);
  const start = days.has(today) ? today : shiftKey(today, -1);

  let count = 0;
  let day = start;
  while (days.has(day)) {
    count += 1;
    day = shiftKey(day, -1);
  }
  return count;
}

/** Longest run of consecutive UTC days with a review. 0 when there are no reviews. */
export function longestStreak(dayKeys: Iterable<string>): number {
  // `YYYY-MM-DD` keys sort chronologically as plain strings.
  const sorted = [...new Set(dayKeys)].sort();

  let longest = 0;
  let run = 0;
  let previous: string | null = null;
  for (const day of sorted) {
    run = previous !== null && shiftKey(previous, 1) === day ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = day;
  }
  return longest;
}
