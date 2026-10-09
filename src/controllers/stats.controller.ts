import type { Request, Response } from 'express';
import type { QueryFilter, Types } from 'mongoose';
import { z } from 'zod';
import { getValidated } from '../middleware/validate';
import { Card, Deck, Review, Session, Subject, type CardFields, type ReviewFields } from '../models';
import type {
  ActivityDay,
  CardResponse,
  DeckStatsResponse,
  ForecastDay,
  StatsOverviewResponse,
  SubjectStatsResponse,
} from '../types/api';
import type { CardStatus } from '../types/domain';
import { AppError } from '../utils/appError';
import { toCardResponse } from '../utils/cardResponse';
import { addUtcDays, endOfUtcDay, startOfUtcDay, utcDayKey } from '../utils/dates';
import { dueFilter } from '../utils/due';
import { idParamsSchema } from '../utils/objectId';
import { average, percent } from '../utils/ratio';
import { currentStreak, longestStreak } from '../utils/streak';

const DECK_NOT_FOUND = 'Deck not found';

// ---- Validation rules (also read by the routes) ----

export const deckRules = { params: idParamsSchema };
export const activityRules = {
  query: z.object({ days: z.coerce.number().int().min(1).max(365).default(30) }),
};
export const hardestRules = {
  query: z.object({ limit: z.coerce.number().int().min(1).max(50).default(10) }),
};
export const forecastRules = {
  query: z.object({ days: z.coerce.number().int().min(1).max(90).default(14) }),
};

// ---- Shared aggregations ----

type CardMatch = QueryFilter<CardFields>;
type ReviewMatch = QueryFilter<ReviewFields>;

interface CardTotals {
  /** The deck id when grouped by deck, `null` for the overall total. */
  _id: Types.ObjectId | null;
  cards: number;
  /** Cards that are not suspended: the denominator of mastery. */
  active: number;
  /** Mastered and not suspended. */
  mastered: number;
  /** Cards past `new`: the population of ease factor. */
  reviewed: number;
  easeTotal: number;
}

interface RetentionTotals {
  _id: Types.ObjectId | null;
  /** Reviews of cards that were not new when reviewed. */
  total: number;
  /** Of those, reviews not rated `again`. */
  retained: number;
}

interface StatusRow {
  _id: CardStatus;
  count: number;
}

const EMPTY_CARD_TOTALS: CardTotals = {
  _id: null,
  cards: 0,
  active: 0,
  mastered: 0,
  reviewed: 0,
  easeTotal: 0,
};
const EMPTY_RETENTION: RetentionTotals = { _id: null, total: 0, retained: 0 };

function emptyStatusCounts(): Record<CardStatus, number> {
  return { new: 0, learning: 0, review: 0, mastered: 0 };
}

async function cardTotals(match: CardMatch, groupBy: '$deck' | null): Promise<CardTotals[]> {
  return Card.aggregate<CardTotals>([
    { $match: match },
    {
      $group: {
        _id: groupBy,
        cards: { $sum: 1 },
        active: { $sum: { $cond: [{ $eq: ['$suspended', false] }, 1, 0] } },
        mastered: {
          $sum: { $cond: [{ $and: [{ $eq: ['$status', 'mastered'] }, { $eq: ['$suspended', false] }] }, 1, 0] },
        },
        reviewed: { $sum: { $cond: [{ $ne: ['$status', 'new'] }, 1, 0] } },
        easeTotal: { $sum: { $cond: [{ $ne: ['$status', 'new'] }, '$easeFactor', 0] } },
      },
    },
  ]);
}

async function retentionTotals(match: ReviewMatch, groupBy: '$deck' | null): Promise<RetentionTotals[]> {
  return Review.aggregate<RetentionTotals>([
    { $match: { ...match, previousStatus: { $ne: 'new' } } },
    {
      $group: {
        _id: groupBy,
        total: { $sum: 1 },
        retained: { $sum: { $cond: [{ $ne: ['$rating', 'again'] }, 1, 0] } },
      },
    },
  ]);
}

async function statusDistribution(match: CardMatch): Promise<Record<CardStatus, number>> {
  const rows = await Card.aggregate<StatusRow>([
    { $match: match },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);
  const distribution = emptyStatusCounts();
  for (const row of rows) distribution[row._id] = row.count;
  return distribution;
}

// ---- Overview ----

export async function getOverview(_req: Request, res: Response<StatsOverviewResponse>): Promise<void> {
  const now = new Date();
  const due = await dueFilter('due', now);
  const [totalSubjects, totalDecks, totalCards, dueToday, reviewsToday, distribution, cardRows, retentionRows, dayRows] =
    await Promise.all([
      Subject.countDocuments(),
      Deck.countDocuments(),
      Card.countDocuments(),
      Card.countDocuments(due),
      Review.countDocuments({ reviewedAt: { $gte: startOfUtcDay(now), $lte: endOfUtcDay(now) } }),
      statusDistribution({}),
      cardTotals({}, null),
      retentionTotals({}, null),
      Review.aggregate<{ _id: string }>([
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$reviewedAt', timezone: 'UTC' } },
          },
        },
      ]),
    ]);

  const totals = cardRows[0] ?? EMPTY_CARD_TOTALS;
  const retention = retentionRows[0] ?? EMPTY_RETENTION;
  const dayKeys = dayRows.map((row) => row._id);

  res.status(200).json({
    totalSubjects,
    totalDecks,
    totalCards,
    dueToday,
    reviewsToday,
    statusDistribution: distribution,
    retentionRate: percent(retention.retained, retention.total),
    averageEaseFactor: average(totals.easeTotal, totals.reviewed, 2),
    currentStreak: currentStreak(dayKeys, now),
    longestStreak: longestStreak(dayKeys),
  });
}

// ---- Deck ----

interface SessionTotals {
  count: number;
  accuracySum: number;
}

export async function getDeckStats(_req: Request, res: Response<DeckStatsResponse>): Promise<void> {
  const { params } = getValidated(res, deckRules);
  const deck = await Deck.findById(params.id).select({ _id: 1 }).lean();
  if (!deck) throw new AppError(404, DECK_NOT_FOUND);

  const now = new Date();
  const due = await dueFilter('due', now, { deck: deck._id });
  const [distribution, cardRows, retentionRows, dueToday, sessionRows] = await Promise.all([
    statusDistribution({ deck: deck._id }),
    cardTotals({ deck: deck._id }, null),
    retentionTotals({ deck: deck._id }, null),
    Card.countDocuments(due),
    Session.aggregate<SessionTotals>([
      { $match: { deck: deck._id, status: 'completed' } },
      { $group: { _id: null, count: { $sum: 1 }, accuracySum: { $sum: '$accuracy' } } },
    ]),
  ]);

  const totals = cardRows[0] ?? EMPTY_CARD_TOTALS;
  const retention = retentionRows[0] ?? EMPTY_RETENTION;
  const sessions = sessionRows[0] ?? { count: 0, accuracySum: 0 };

  res.status(200).json({
    cardCount: totals.cards,
    statusDistribution: distribution,
    masteryPercent: percent(totals.mastered, totals.active),
    retentionRate: percent(retention.retained, retention.total),
    averageEaseFactor: average(totals.easeTotal, totals.reviewed, 2),
    dueToday,
    sessionCount: sessions.count,
    averageSessionAccuracy: average(sessions.accuracySum, sessions.count, 1),
  });
}

// ---- Subjects ----

interface Rollup {
  deckCount: number;
  cardCount: number;
  active: number;
  mastered: number;
  total: number;
  retained: number;
}

function emptyRollup(): Rollup {
  return { deckCount: 0, cardCount: 0, active: 0, mastered: 0, total: 0, retained: 0 };
}

export async function getSubjectStats(_req: Request, res: Response<SubjectStatsResponse[]>): Promise<void> {
  const [subjects, decks, cardRows, retentionRows] = await Promise.all([
    Subject.find().select({ name: 1 }).lean(),
    Deck.find().select({ subject: 1 }).lean(),
    cardTotals({}, '$deck'),
    retentionTotals({}, '$deck'),
  ]);

  // Roll each deck's totals up to its subject. Archived decks count, as they do in `deckCount`.
  const subjectOfDeck = new Map(decks.map((deck) => [deck._id.toString(), deck.subject.toString()]));
  const rollups = new Map<string, Rollup>(subjects.map((subject) => [subject._id.toString(), emptyRollup()]));
  const rollupOfDeck = (deckId: Types.ObjectId | null): Rollup | undefined => {
    const subjectId = deckId ? subjectOfDeck.get(deckId.toString()) : undefined;
    return subjectId === undefined ? undefined : rollups.get(subjectId);
  };

  for (const deck of decks) {
    const rollup = rollups.get(deck.subject.toString());
    if (rollup) rollup.deckCount += 1;
  }
  for (const row of cardRows) {
    const rollup = rollupOfDeck(row._id);
    if (!rollup) continue;
    rollup.cardCount += row.cards;
    rollup.active += row.active;
    rollup.mastered += row.mastered;
  }
  for (const row of retentionRows) {
    const rollup = rollupOfDeck(row._id);
    if (!rollup) continue;
    rollup.total += row.total;
    rollup.retained += row.retained;
  }

  const data: SubjectStatsResponse[] = subjects.map((subject) => {
    const rollup = rollups.get(subject._id.toString()) ?? emptyRollup();
    return {
      _id: subject._id.toString(),
      name: subject.name,
      deckCount: rollup.deckCount,
      cardCount: rollup.cardCount,
      masteryPercent: percent(rollup.mastered, rollup.active),
      retentionRate: percent(rollup.retained, rollup.total),
    };
  });
  data.sort((a, b) => b.masteryPercent - a.masteryPercent || a.name.localeCompare(b.name));
  res.status(200).json(data);
}

// ---- Activity ----

interface ActivityRow {
  _id: string;
  reviews: number;
  correct: number;
}

export async function getActivity(_req: Request, res: Response<ActivityDay[]>): Promise<void> {
  const { query } = getValidated(res, activityRules);
  const now = new Date();
  const firstDay = addUtcDays(startOfUtcDay(now), -(query.days - 1));

  const rows = await Review.aggregate<ActivityRow>([
    { $match: { reviewedAt: { $gte: firstDay, $lte: endOfUtcDay(now) } } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$reviewedAt', timezone: 'UTC' } },
        reviews: { $sum: 1 },
        correct: { $sum: { $cond: [{ $ne: ['$rating', 'again'] }, 1, 0] } },
      },
    },
  ]);

  const byDay = new Map(rows.map((row) => [row._id, row]));
  const data: ActivityDay[] = [];
  for (let offset = 0; offset < query.days; offset += 1) {
    const date = utcDayKey(addUtcDays(firstDay, offset));
    const row = byDay.get(date);
    data.push({ date, reviews: row?.reviews ?? 0, correct: row?.correct ?? 0 });
  }
  res.status(200).json(data);
}

// ---- Hardest cards ----

export async function getHardest(_req: Request, res: Response<CardResponse[]>): Promise<void> {
  const { query } = getValidated(res, hardestRules);
  const now = new Date();
  const cards = await Card.find({ lapses: { $gte: 1 } })
    .sort({ lapses: -1, easeFactor: 1, _id: 1 })
    .limit(query.limit)
    .lean();

  const decks = await Deck.find({ _id: { $in: cards.map((card) => card.deck) } })
    .select({ archived: 1 })
    .lean();
  const archivedById = new Map(decks.map((deck) => [deck._id.toString(), deck.archived]));

  res.status(200).json(
    cards.map((card) =>
      toCardResponse(card, { _id: card.deck, archived: archivedById.get(card.deck.toString()) ?? false }, now),
    ),
  );
}

// ---- Forecast ----

interface ForecastRow {
  _id: string;
  count: number;
}

export async function getForecast(_req: Request, res: Response<ForecastDay[]>): Promise<void> {
  const { query } = getValidated(res, forecastRules);
  const now = new Date();
  const today = startOfUtcDay(now);
  const lastDayEnd = endOfUtcDay(addUtcDays(today, query.days - 1));

  const due = await dueFilter('due', now);
  const upcoming = await dueFilter('upcoming', now);
  const [dueToday, rows] = await Promise.all([
    Card.countDocuments(due),
    Card.aggregate<ForecastRow>([
      { $match: { ...upcoming, dueDate: { $gt: endOfUtcDay(now), $lte: lastDayEnd } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$dueDate', timezone: 'UTC' } },
          count: { $sum: 1 },
        },
      },
    ]),
  ]);

  // Day 0 is `dueToday` by definition: overdue cards are counted there.
  const byDay = new Map(rows.map((row) => [row._id, row.count]));
  const data: ForecastDay[] = [];
  for (let offset = 0; offset < query.days; offset += 1) {
    const date = utcDayKey(addUtcDays(today, offset));
    data.push({ date, count: offset === 0 ? dueToday : (byDay.get(date) ?? 0) });
  }
  res.status(200).json(data);
}
