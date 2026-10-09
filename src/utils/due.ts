import type { Types } from 'mongoose';
import { Deck } from '../models';
import { addUtcDays, endOfUtcDay, startOfUtcDay } from './dates';

/**
 * The single definition of "due", shared by the cards `due` filter, deck `dueCount`, the
 * study queue, stats `dueToday` and the forecast.
 *
 * - eligible: the card is not suspended and its deck is not archived
 * - due:      eligible, `status` is not `new`, and `dueDate <= end of today (UTC)`
 * - overdue:  due and `dueDate < start of today (UTC)`
 * - today:    due and `dueDate` within today; `overdue` + `today` are exactly `due`
 * - upcoming: eligible, not `new`, and `dueDate` after the end of today
 *
 * `new` cards never match any bucket; the queue serves them separately.
 */
export type DueBucket = 'due' | 'overdue' | 'today' | 'upcoming';

export interface DateRange {
  $lt?: Date;
  $lte?: Date;
  $gt?: Date;
  $gte?: Date;
}

/** Card-level conditions of a bucket (everything except the archived-deck rule). */
export interface DueConditions {
  status: { $ne: 'new' };
  suspended: false;
  dueDate: DateRange;
}

/** `DueConditions` restricted to cards of non-archived decks; usable in `find` and in `$match`. */
export interface DueFilter extends DueConditions {
  deck: { $in: Types.ObjectId[] };
}

export function dueDateRange(bucket: DueBucket, now: Date): DateRange {
  switch (bucket) {
    case 'due':
      return { $lte: endOfUtcDay(now) };
    case 'overdue':
      return { $lt: startOfUtcDay(now) };
    case 'today':
      return { $gte: startOfUtcDay(now), $lte: endOfUtcDay(now) };
    case 'upcoming':
      return { $gt: endOfUtcDay(now) };
  }
}

export function dueConditions(bucket: DueBucket, now: Date): DueConditions {
  return { status: { $ne: 'new' }, suspended: false, dueDate: dueDateRange(bucket, now) };
}

type DeckRef = string | Types.ObjectId;

/**
 * Ids of the non-archived decks, optionally narrowed to one deck or a list of decks
 * (archived and missing decks are left out).
 */
export async function activeDeckIds(deck?: DeckRef | DeckRef[]): Promise<Types.ObjectId[]> {
  const idCondition = deck === undefined ? {} : { _id: Array.isArray(deck) ? { $in: deck } : deck };
  const decks = await Deck.find({ ...idCondition, archived: false })
    .select({ _id: 1 })
    .lean();
  return decks.map((found) => found._id);
}

/**
 * The shared due filter. Pass it to `Card.find`, `Card.countDocuments` or an aggregation
 * `$match`; merge endpoint-specific filters around it, do not rebuild it.
 */
export async function dueFilter(
  bucket: DueBucket,
  now: Date = new Date(),
  options: { deck?: DeckRef | DeckRef[] } = {},
): Promise<DueFilter> {
  return { ...dueConditions(bucket, now), deck: { $in: await activeDeckIds(options.deck) } };
}

export interface OverdueCandidate {
  status: string;
  suspended: boolean;
  dueDate: Date;
}

/**
 * Whole UTC days a card is overdue (calendar days between its due day and today); 0 for a
 * card that is not overdue, and always 0 for `new`, suspended and archived-deck cards.
 */
export function overdueDays(card: OverdueCandidate, deckArchived: boolean, now: Date = new Date()): number {
  if (card.status === 'new' || card.suspended || deckArchived) return 0;
  const today = startOfUtcDay(now);
  if (card.dueDate >= today) return 0;
  const dueDay = startOfUtcDay(card.dueDate);
  const oneDay = addUtcDays(dueDay, 1).getTime() - dueDay.getTime();
  return Math.round((today.getTime() - dueDay.getTime()) / oneDay);
}
