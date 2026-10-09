const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** 00:00:00.000 UTC of the day containing `date`. */
export function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/** 23:59:59.999 UTC of the day containing `date`. */
export function endOfUtcDay(date: Date): Date {
  return new Date(startOfUtcDay(date).getTime() + MS_PER_DAY - 1);
}

/** `date` moved by a whole number of 24-hour days (UTC has no daylight saving). */
export function addUtcDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * MS_PER_DAY);
}

/** The UTC day containing `date` as `YYYY-MM-DD`: the key used for per-day grouping. */
export function utcDayKey(date: Date): string {
  return startOfUtcDay(date).toISOString().slice(0, 10);
}
