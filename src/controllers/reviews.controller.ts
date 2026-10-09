import type { Request, Response } from 'express';
import type { QueryFilter } from 'mongoose';
import { z } from 'zod';
import { getValidated } from '../middleware/validate';
import { Card, Deck, Review, Session, type ReviewFields } from '../models';
import type { ListResponse, ReviewResponse, ReviewResult } from '../types/api';
import { RATINGS } from '../types/domain';
import { AppError } from '../utils/appError';
import { toCardResponse } from '../utils/cardResponse';
import { endOfUtcDay, startOfUtcDay } from '../utils/dates';
import { idParamsSchema, objectIdSchema } from '../utils/objectId';
import { buildListResponse, DEFAULT_LIMIT_PAGED, paginationQuerySchema, toSkip } from '../utils/pagination';
import { toReviewResponse } from '../utils/reviewResponse';
import { schedule } from '../utils/schedule';
import { runInTransaction } from '../utils/transaction';

// ---- Validation rules (also read by the routes) ----

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const dateInput = z.union([z.iso.date(), z.iso.datetime({ offset: true })], {
  error: 'must be an ISO date (YYYY-MM-DD) or datetime',
});

/** `from`: a date means the start of that UTC day; a datetime is used as given. */
const fromInput = dateInput.transform((value) => new Date(DATE_ONLY.test(value) ? `${value}T00:00:00.000Z` : value));
/** `to` is inclusive: a date means the end of that UTC day; a datetime is used as given. */
const toInput = dateInput.transform((value) =>
  DATE_ONLY.test(value) ? endOfUtcDay(new Date(`${value}T00:00:00.000Z`)) : new Date(value),
);

export const listReviewsRules = {
  query: paginationQuerySchema(DEFAULT_LIMIT_PAGED)
    .extend({
      card: objectIdSchema.optional(),
      deck: objectIdSchema.optional(),
      session: objectIdSchema.optional(),
      rating: z.enum(RATINGS).optional(),
      from: fromInput.optional(),
      to: toInput.optional(),
      sort: z.enum(['reviewedAt']).default('reviewedAt'),
      order: z.enum(['asc', 'desc']).default('desc'),
    })
    .refine((query) => query.from === undefined || query.to === undefined || query.from <= query.to, {
      path: ['from'],
      error: 'must not be after to',
    }),
};
export const idRules = { params: idParamsSchema };

export const createReviewRules = {
  params: idParamsSchema,
  body: z.strictObject({
    rating: z.enum(RATINGS),
    timeSpentMs: z.number().min(0).optional(),
    session: objectIdSchema.optional(),
  }),
};

// ---- Handlers ----

/**
 * Reviews one card: checks the guards, runs `schedule`, then updates the card and saves the review
 * in one transaction. Guards are checked in this order, each a 400 with its own message: suspended,
 * not due yet, deck archived, daily new limit used, session completed or of another deck.
 */
export async function createReview(_req: Request, res: Response<ReviewResult>): Promise<void> {
  const { params, body } = getValidated(res, createReviewRules);
  const now = new Date();

  const card = await Card.findById(params.id).lean();
  if (!card) throw new AppError(404, 'Card not found');
  if (card.suspended) throw new AppError(400, 'Card is suspended');
  if (card.dueDate > endOfUtcDay(now)) throw new AppError(400, 'Card is not due yet');

  const deck = await Deck.findById(card.deck).select({ archived: 1, dailyNewLimit: 1 }).lean();
  if (!deck) throw new AppError(404, 'Deck not found');
  if (deck.archived) throw new AppError(400, 'Deck is archived');

  if (card.status === 'new') {
    const firstReviewsToday = await Review.countDocuments({
      deck: deck._id,
      previousStatus: 'new',
      reviewedAt: { $gte: startOfUtcDay(now), $lte: endOfUtcDay(now) },
    });
    if (firstReviewsToday >= deck.dailyNewLimit) {
      throw new AppError(400, 'Daily new card limit reached for this deck');
    }
  }

  if (body.session !== undefined) {
    const session = await Session.findById(body.session).lean();
    if (!session) throw new AppError(404, 'Session not found');
    if (session.status === 'completed') throw new AppError(400, 'Session is already completed');
    if (!session.deck.equals(card.deck)) throw new AppError(400, 'Session belongs to a different deck');
  }

  const next = schedule(card, body.rating, now);

  let result: ReviewResult | undefined;
  await runInTransaction(async (session) => {
    // Only update the card if it is still the one the guards looked at: a concurrent review or a
    // suspension in between changes `dueDate`, `status` or `suspended`, and this write then matches nothing.
    const updated = await Card.findOneAndUpdate(
      { _id: card._id, dueDate: card.dueDate, status: card.status, suspended: false },
      {
        $set: {
          easeFactor: next.easeFactor,
          intervalDays: next.intervalDays,
          repetitions: next.repetitions,
          lapses: next.lapses,
          dueDate: next.dueDate,
          status: next.status,
          lastReviewedAt: now,
        },
      },
      { returnDocument: 'after', runValidators: true, session },
    );
    if (!updated) throw new AppError(409, 'Card was changed by another request, please try again');

    const [review] = await Review.create(
      [
        {
          card: card._id,
          deck: card.deck,
          ...(body.session === undefined ? {} : { session: body.session }),
          rating: body.rating,
          previousStatus: card.status,
          newStatus: next.status,
          previousInterval: card.intervalDays,
          newInterval: next.intervalDays,
          easeFactorAfter: next.easeFactor,
          ...(body.timeSpentMs === undefined ? {} : { timeSpentMs: body.timeSpentMs }),
          reviewedAt: now,
        },
      ],
      { session },
    );
    if (!review) throw new Error('Review was not created');
    result = {
      review: toReviewResponse(review),
      card: toCardResponse(updated, { _id: card.deck, archived: false }, now),
    };
  });

  if (!result) throw new Error('Review transaction did not produce a result');
  res.status(201).json(result);
}

// ---- Reading history (append-only: there are no update or delete endpoints) ----

export async function listReviews(_req: Request, res: Response<ListResponse<ReviewResponse>>): Promise<void> {
  const { query } = getValidated(res, listReviewsRules);
  const filter: QueryFilter<ReviewFields> = {
    ...(query.card === undefined ? {} : { card: query.card }),
    ...(query.deck === undefined ? {} : { deck: query.deck }),
    ...(query.session === undefined ? {} : { session: query.session }),
    ...(query.rating === undefined ? {} : { rating: query.rating }),
    ...(query.from === undefined && query.to === undefined
      ? {}
      : {
          reviewedAt: {
            ...(query.from === undefined ? {} : { $gte: query.from }),
            ...(query.to === undefined ? {} : { $lte: query.to }),
          },
        }),
  };
  const [reviews, total] = await Promise.all([
    Review.find(filter)
      .sort({ reviewedAt: query.order === 'asc' ? 1 : -1, _id: 1 })
      .skip(toSkip(query))
      .limit(query.limit)
      .lean(),
    Review.countDocuments(filter),
  ]);
  res.status(200).json(buildListResponse(reviews.map(toReviewResponse), total, query));
}

export async function getReview(_req: Request, res: Response<ReviewResponse>): Promise<void> {
  const { params } = getValidated(res, idRules);
  const review = await Review.findById(params.id).lean();
  if (!review) throw new AppError(404, 'Review not found');
  res.status(200).json(toReviewResponse(review));
}
