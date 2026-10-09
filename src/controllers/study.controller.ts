import type { Request, Response } from 'express';
import type { Types } from 'mongoose';
import { z } from 'zod';
import { getValidated } from '../middleware/validate';
import { Card, Deck, Review } from '../models';
import type { QueueResponse } from '../types/api';
import { AppError } from '../utils/appError';
import { toCardResponse } from '../utils/cardResponse';
import { endOfUtcDay, startOfUtcDay } from '../utils/dates';
import { dueFilter } from '../utils/due';
import { objectIdSchema } from '../utils/objectId';
import { DEFAULT_LIMIT_PAGED, MAX_LIMIT } from '../utils/pagination';

// ---- Validation rules (also read by the routes) ----

export const queueRules = {
  query: z.object({
    deck: objectIdSchema.optional(),
    // Caps each of the two lists (`due` and `new`); `counts` always shows the totals available.
    limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT_PAGED),
  }),
};

// ---- Queue ----

interface DeckAllowance {
  _id: Types.ObjectId;
  dailyNewLimit: number;
}

interface CountRow {
  _id: Types.ObjectId;
  count: number;
}

/** Non-archived decks in scope, with their daily new-card limit. */
async function decksInScope(deck: string | undefined): Promise<DeckAllowance[]> {
  if (deck === undefined) {
    return Deck.find({ archived: false }).select({ dailyNewLimit: 1 }).lean();
  }
  const found = await Deck.findById(deck).select({ archived: 1, dailyNewLimit: 1 }).lean();
  if (!found) throw new AppError(404, 'Deck not found');
  return found.archived ? [] : [found];
}

/** New cards still allowed today in each deck: `dailyNewLimit` minus cards first reviewed today. */
async function remainingNewAllowance(decks: DeckAllowance[], now: Date): Promise<Map<string, number>> {
  const remaining = new Map<string, number>();
  if (decks.length === 0) return remaining;

  const usedRows = await Review.aggregate<CountRow>([
    {
      $match: {
        deck: { $in: decks.map((deck) => deck._id) },
        previousStatus: 'new',
        reviewedAt: { $gte: startOfUtcDay(now), $lte: endOfUtcDay(now) },
      },
    },
    { $group: { _id: '$deck', count: { $sum: 1 } } },
  ]);
  const used = new Map(usedRows.map((row) => [row._id.toString(), row.count]));
  for (const deck of decks) {
    remaining.set(deck._id.toString(), Math.max(0, deck.dailyNewLimit - (used.get(deck._id.toString()) ?? 0)));
  }
  return remaining;
}

export async function getQueue(_req: Request, res: Response<QueueResponse>): Promise<void> {
  const { query } = getValidated(res, queueRules);
  const now = new Date();
  const decks = await decksInScope(query.deck);
  const deckIds = decks.map((deck) => deck._id);

  // Due cards: the shared definition, most overdue first.
  const due = await dueFilter('due', now, query.deck === undefined ? {} : { deck: query.deck });
  const [dueCards, dueTotal] = await Promise.all([
    Card.find(due).sort({ dueDate: 1, _id: 1 }).limit(query.limit).lean(),
    Card.countDocuments(due),
  ]);

  // New cards: per deck, only as many as that deck's remaining daily allowance.
  const remaining = await remainingNewAllowance(decks, now);
  const withAllowance = deckIds.filter((id) => (remaining.get(id.toString()) ?? 0) > 0);
  const availableRows =
    withAllowance.length === 0
      ? []
      : await Card.aggregate<CountRow>([
          { $match: { deck: { $in: withAllowance }, status: 'new', suspended: false } },
          { $group: { _id: '$deck', count: { $sum: 1 } } },
        ]);
  const available = new Map(availableRows.map((row) => [row._id.toString(), row.count]));

  let newTotal = 0;
  const perDeck = await Promise.all(
    withAllowance.map(async (deckId) => {
      const allowed = Math.min(remaining.get(deckId.toString()) ?? 0, available.get(deckId.toString()) ?? 0);
      newTotal += allowed;
      if (allowed === 0) return [];
      return Card.find({ deck: deckId, status: 'new', suspended: false })
        .sort({ createdAt: 1, _id: 1 })
        .limit(Math.min(allowed, query.limit))
        .lean();
    }),
  );
  const newCards = perDeck
    .flat()
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a._id.toString().localeCompare(b._id.toString()))
    .slice(0, query.limit);

  // Both lists only contain cards of non-archived decks, so `archived` is false for each.
  const toResponse = (card: (typeof dueCards)[number]) => toCardResponse(card, { _id: card.deck, archived: false }, now);
  res.status(200).json({
    due: dueCards.map(toResponse),
    new: newCards.map(toResponse),
    counts: { due: dueTotal, new: newTotal, total: dueTotal + newTotal },
  });
}
