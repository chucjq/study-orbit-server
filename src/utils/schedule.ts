import type { CardStatus, Rating } from '../types/domain';
import { addUtcDays, startOfUtcDay } from './dates';

/** The scheduling fields of a card that `schedule` reads. */
export interface SchedulableCard {
  easeFactor: number;
  intervalDays: number;
  repetitions: number;
  lapses: number;
}

/** The new scheduling state of a card after one review. */
export interface ScheduleResult {
  easeFactor: number;
  intervalDays: number;
  repetitions: number;
  lapses: number;
  dueDate: Date;
  status: Exclude<CardStatus, 'new'>;
}

/** API rating -> SM-2 quality grade. */
export const RATING_TO_QUALITY: Record<Rating, number> = {
  again: 1,
  hard: 3,
  good: 4,
  easy: 5,
};

export const MIN_EASE_FACTOR = 1.3;
export const MASTERED_INTERVAL_DAYS = 21;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function statusFor(repetitions: number, intervalDays: number, again: boolean): ScheduleResult['status'] {
  if (again || repetitions <= 1) return 'learning';
  if (intervalDays >= MASTERED_INTERVAL_DAYS) return 'mastered';
  return 'review';
}

/**
 * Original SM-2. Pure: no database access, `now` is injected, the input is not mutated.
 * `dueDate` is the start of today (UTC) plus the new interval, so a card rated `again`
 * is due tomorrow.
 */
export function schedule(card: SchedulableCard, rating: Rating, now: Date): ScheduleResult {
  const q = RATING_TO_QUALITY[rating];

  let easeFactor = card.easeFactor;
  let intervalDays: number;
  let repetitions: number;
  let lapses = card.lapses;

  if (q < 3) {
    repetitions = 0;
    intervalDays = 1;
    lapses += 1;
  } else {
    const miss = 5 - q;
    easeFactor = round2(Math.max(MIN_EASE_FACTOR, easeFactor + (0.1 - miss * (0.08 + miss * 0.02))));
    repetitions = card.repetitions + 1;
    if (repetitions === 1) intervalDays = 1;
    else if (repetitions === 2) intervalDays = 6;
    else intervalDays = Math.max(1, Math.round(card.intervalDays * easeFactor));
  }

  return {
    easeFactor,
    intervalDays,
    repetitions,
    lapses,
    dueDate: addUtcDays(startOfUtcDay(now), intervalDays),
    status: statusFor(repetitions, intervalDays, q < 3),
  };
}
