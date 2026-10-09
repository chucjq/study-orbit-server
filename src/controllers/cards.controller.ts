import type { Request, Response } from 'express';
import type { QueryFilter, Types } from 'mongoose';
import { z } from 'zod';
import { getValidated } from '../middleware/validate';
import { Card, Deck, Review, type CardFields } from '../models';
import { CARD_STATUSES } from '../types/domain';
import type { CardResponse, ListResponse, MessageResponse } from '../types/api';
import { AppError } from '../utils/appError';
import { toCardResponse, type DeckFlags } from '../utils/cardResponse';
import { dueFilter } from '../utils/due';
import { idParamsSchema, objectIdSchema } from '../utils/objectId';
import { buildListResponse, DEFAULT_LIMIT_PAGED, paginationQuerySchema, toSkip } from '../utils/pagination';
import { escapeRegex } from '../utils/regex';
import { runInTransaction } from '../utils/transaction';

const CARD_NOT_FOUND = 'Card not found';
const DECK_NOT_FOUND = 'Deck not found';

// ---- Validation rules (also read by the routes) ----

// Strict: scheduling fields (easeFactor, intervalDays, repetitions, lapses, dueDate, status) and
// `suspended` are rejected with 400 "Unknown field: <name>". Only the review endpoint changes them.
const editableBody = {
  deck: objectIdSchema,
  front: z.string().trim().min(1).max(500),
  back: z.string().trim().min(1).max(1000),
  tags: z.array(z.string().trim().min(1)).max(10).optional(),
};
const cardBodySchema = z.strictObject(editableBody);
const suspensionBodySchema = z.strictObject({ suspended: z.boolean() });

/** Filters shared by `GET /api/cards` and `GET /api/decks/:id/cards`. */
const cardFilterShape = {
  status: z.enum(CARD_STATUSES).optional(),
  tag: z.string().trim().min(1).optional(),
  suspended: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
  due: z.enum(['overdue', 'today', 'upcoming']).optional(),
  search: z.string().trim().optional(),
  sort: z.enum(['dueDate', 'easeFactor', 'lapses', 'createdAt']).default('dueDate'),
  order: z.enum(['asc', 'desc']).default('asc'),
};
const pagedQuery = paginationQuerySchema(DEFAULT_LIMIT_PAGED);

export const listRules = { query: pagedQuery.extend({ ...cardFilterShape, deck: objectIdSchema.optional() }) };
export const deckCardsRules = { params: idParamsSchema, query: pagedQuery.extend(cardFilterShape) };
export const idRules = { params: idParamsSchema };
export const bodyRules = { body: cardBodySchema };
export const idAndBodyRules = { params: idParamsSchema, body: cardBodySchema };
export const suspensionRules = { params: idParamsSchema, body: suspensionBodySchema };

async function findDeck(id: string | Types.ObjectId): Promise<DeckFlags> {
  const deck = await Deck.findById(id).select({ archived: 1 }).lean();
  if (!deck) throw new AppError(404, DECK_NOT_FOUND);
  return deck;
}

// ---- Listing (shared by two endpoints) ----

type CardQuery = z.output<(typeof listRules)['query']>;

async function listCards(res: Response<ListResponse<CardResponse>>, query: CardQuery): Promise<void> {
  const now = new Date();
  const flat: QueryFilter<CardFields> = {
    ...(query.deck === undefined ? {} : { deck: query.deck }),
    ...(query.status === undefined ? {} : { status: query.status }),
    ...(query.tag === undefined ? {} : { tags: query.tag }),
    ...(query.suspended === undefined ? {} : { suspended: query.suspended }),
    ...(query.search
      ? {
          $or: [
            { front: { $regex: escapeRegex(query.search), $options: 'i' } },
            { back: { $regex: escapeRegex(query.search), $options: 'i' } },
          ],
        }
      : {}),
  };
  // `due` comes from the shared helper (non-new, not suspended, non-archived deck, date bucket).
  const filter: QueryFilter<CardFields> = query.due
    ? { $and: [await dueFilter(query.due, now, query.deck === undefined ? {} : { deck: query.deck }), flat] }
    : flat;
  const sort: Record<string, 1 | -1> = { [query.sort]: query.order === 'asc' ? 1 : -1, _id: 1 };

  const [cards, total] = await Promise.all([
    Card.find(filter)
      .populate<{ deck: DeckFlags }>('deck', 'archived')
      .sort(sort)
      .skip(toSkip(query))
      .limit(query.limit)
      .lean(),
    Card.countDocuments(filter),
  ]);
  const data = cards.map((card) => toCardResponse(card, card.deck, now));
  res.status(200).json(buildListResponse(data, total, query));
}

// ---- Handlers ----

export async function listAllCards(_req: Request, res: Response<ListResponse<CardResponse>>): Promise<void> {
  await listCards(res, getValidated(res, listRules).query);
}

export async function listDeckCards(_req: Request, res: Response<ListResponse<CardResponse>>): Promise<void> {
  const { params, query } = getValidated(res, deckCardsRules);
  await findDeck(params.id);
  await listCards(res, { ...query, deck: params.id });
}

export async function getCard(_req: Request, res: Response<CardResponse>): Promise<void> {
  const { params } = getValidated(res, idRules);
  const card = await Card.findById(params.id).populate<{ deck: DeckFlags }>('deck', 'archived').lean();
  if (!card) throw new AppError(404, CARD_NOT_FOUND);
  res.status(200).json(toCardResponse(card, card.deck, new Date()));
}

export async function createCard(_req: Request, res: Response<CardResponse>): Promise<void> {
  const { body } = getValidated(res, bodyRules);
  const deck = await findDeck(body.deck);
  const card = await Card.create(body);
  res.status(201).json(toCardResponse(card, deck, new Date()));
}

/** Replaces the editable fields; an omitted `tags` becomes `[]`. Scheduling state is never touched. */
export async function updateCard(_req: Request, res: Response<CardResponse>): Promise<void> {
  const { params, body } = getValidated(res, idAndBodyRules);
  const card = await Card.findById(params.id);
  if (!card) throw new AppError(404, CARD_NOT_FOUND);
  const deck = await findDeck(body.deck);

  card.deck = deck._id;
  card.front = body.front;
  card.back = body.back;
  card.set('tags', body.tags ?? []);
  await card.save();
  res.status(200).json(toCardResponse(card, deck, new Date()));
}

/** Deletes a card and its reviews in one transaction. */
export async function deleteCard(_req: Request, res: Response<MessageResponse>): Promise<void> {
  const { params } = getValidated(res, idRules);
  const card = await Card.findById(params.id).select({ _id: 1 }).lean();
  if (!card) throw new AppError(404, CARD_NOT_FOUND);

  await runInTransaction(async (session) => {
    await Review.deleteMany({ card: card._id }, { session });
    const result = await Card.deleteOne({ _id: card._id }, { session });
    // Deleted by someone else since the check above: abort and report it as missing.
    if (result.deletedCount === 0) throw new AppError(404, CARD_NOT_FOUND);
  });
  res.status(200).json({ message: 'Card deleted' });
}

/** Sets only `suspended`; status and scheduling fields stay as they were, so unsuspending restores the card. */
export async function setSuspension(_req: Request, res: Response<CardResponse>): Promise<void> {
  const { params, body } = getValidated(res, suspensionRules);
  const card = await Card.findById(params.id);
  if (!card) throw new AppError(404, CARD_NOT_FOUND);
  const deck = await findDeck(card.deck);

  card.suspended = body.suspended;
  await card.save();
  res.status(200).json(toCardResponse(card, deck, new Date()));
}
