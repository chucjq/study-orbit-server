import type { Request, Response } from 'express';
import type { QueryFilter, Types } from 'mongoose';
import { z } from 'zod';
import { getValidated } from '../middleware/validate';
import { Card, Deck, Review, Session, Subject, type DeckFields } from '../models';
import { DEFAULT_DAILY_NEW_LIMIT, DEFAULT_DECK_COLOR } from '../models/Deck';
import { HEX_COLOR } from '../models/validators';
import type { DeckResponse, DeckSubjectSummary, ListResponse, MessageResponse } from '../types/api';
import { AppError } from '../utils/appError';
import { dueFilter } from '../utils/due';
import { idParamsSchema, objectIdSchema } from '../utils/objectId';
import { buildListResponse, DEFAULT_LIMIT_ALL, paginationQuerySchema, toSkip } from '../utils/pagination';
import { escapeRegex } from '../utils/regex';
import { runInTransaction } from '../utils/transaction';

const DECK_NOT_FOUND = 'Deck not found';
const SUBJECT_NOT_FOUND = 'Subject not found';
const CASE_INSENSITIVE = { locale: 'en', strength: 2 } as const;

// ---- Validation rules (also read by the routes) ----

const bodySchema = z.strictObject({
  title: z.string().trim().min(3).max(60),
  subject: objectIdSchema,
  // An empty string clears the description.
  description: z
    .string()
    .trim()
    .max(300)
    .transform((value) => (value === '' ? undefined : value))
    .optional(),
  color: z.string().regex(HEX_COLOR, 'must be a hex color like #6366f1').optional(),
  dailyNewLimit: z.number().int().min(1).max(100).optional(),
  archived: z.boolean().optional(),
});

export const listRules = {
  query: paginationQuerySchema(DEFAULT_LIMIT_ALL).extend({
    archived: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .optional(),
    subject: objectIdSchema.optional(),
    search: z.string().trim().optional(),
    sort: z.enum(['title', 'createdAt']).default('title'),
  }),
};
export const idRules = { params: idParamsSchema };
export const bodyRules = { body: bodySchema };
export const idAndBodyRules = { params: idParamsSchema, body: bodySchema };

// ---- Response mapping ----

interface DeckLike {
  _id: Types.ObjectId;
  title: string;
  description?: string | null | undefined;
  color: string;
  dailyNewLimit: number;
  archived: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface SubjectSummary {
  _id: Types.ObjectId;
  name: string;
  color: string;
}

interface DeckCounts {
  cardCount: number;
  dueCount: number;
}

const NO_CARDS: DeckCounts = { cardCount: 0, dueCount: 0 };

function toResponse(deck: DeckLike, subject: SubjectSummary, counts: DeckCounts): DeckResponse {
  const subjectSummary: DeckSubjectSummary = {
    _id: subject._id.toString(),
    name: subject.name,
    color: subject.color,
  };
  return {
    _id: deck._id.toString(),
    title: deck.title,
    subject: subjectSummary,
    ...(deck.description ? { description: deck.description } : {}),
    color: deck.color,
    dailyNewLimit: deck.dailyNewLimit,
    archived: deck.archived,
    cardCount: counts.cardCount,
    dueCount: counts.dueCount,
    createdAt: deck.createdAt.toISOString(),
    updatedAt: deck.updatedAt.toISOString(),
  };
}

interface CountRow {
  _id: Types.ObjectId;
  count: number;
}

/** `cardCount` and `dueCount` for several decks in two queries; `dueCount` uses the shared due filter. */
async function countCards(deckIds: Types.ObjectId[], now: Date): Promise<Map<string, DeckCounts>> {
  const counts = new Map<string, DeckCounts>();
  if (deckIds.length === 0) return counts;

  const [cardRows, dueRows] = await Promise.all([
    Card.aggregate<CountRow>([
      { $match: { deck: { $in: deckIds } } },
      { $group: { _id: '$deck', count: { $sum: 1 } } },
    ]),
    dueFilter('due', now, { deck: deckIds }).then((filter) =>
      Card.aggregate<CountRow>([{ $match: filter }, { $group: { _id: '$deck', count: { $sum: 1 } } }]),
    ),
  ]);
  for (const row of cardRows) counts.set(row._id.toString(), { cardCount: row.count, dueCount: 0 });
  for (const row of dueRows) {
    const existing = counts.get(row._id.toString()) ?? NO_CARDS;
    counts.set(row._id.toString(), { ...existing, dueCount: row.count });
  }
  return counts;
}

async function findSubject(id: string): Promise<SubjectSummary> {
  const subject = await Subject.findById(id).select('name color').lean();
  if (!subject) throw new AppError(404, SUBJECT_NOT_FOUND);
  return subject;
}

type PopulatedDeck = DeckLike & { subject: SubjectSummary };

// ---- Handlers ----

export async function listDecks(_req: Request, res: Response<ListResponse<DeckResponse>>): Promise<void> {
  const { query } = getValidated(res, listRules);
  const filter: QueryFilter<DeckFields> = {
    ...(query.archived === undefined ? {} : { archived: query.archived }),
    ...(query.subject === undefined ? {} : { subject: query.subject }),
    ...(query.search ? { title: { $regex: escapeRegex(query.search), $options: 'i' } } : {}),
  };
  const sort: Record<string, 1> = query.sort === 'title' ? { title: 1, _id: 1 } : { createdAt: 1, _id: 1 };

  const [decks, total] = await Promise.all([
    Deck.find(filter)
      .populate<{ subject: SubjectSummary }>('subject', 'name color')
      .collation(CASE_INSENSITIVE)
      .sort(sort)
      .skip(toSkip(query))
      .limit(query.limit)
      .lean(),
    Deck.countDocuments(filter),
  ]);
  const counts = await countCards(
    decks.map((deck) => deck._id),
    new Date(),
  );
  const data = decks.map((deck) => toResponse(deck, deck.subject, counts.get(deck._id.toString()) ?? NO_CARDS));
  res.status(200).json(buildListResponse(data, total, query));
}

export async function getDeck(_req: Request, res: Response<DeckResponse>): Promise<void> {
  const { params } = getValidated(res, idRules);
  const deck: PopulatedDeck | null = await Deck.findById(params.id)
    .populate<{ subject: SubjectSummary }>('subject', 'name color')
    .lean();
  if (!deck) throw new AppError(404, DECK_NOT_FOUND);
  const counts = await countCards([deck._id], new Date());
  res.status(200).json(toResponse(deck, deck.subject, counts.get(deck._id.toString()) ?? NO_CARDS));
}

export async function createDeck(_req: Request, res: Response<DeckResponse>): Promise<void> {
  const { body } = getValidated(res, bodyRules);
  const subject = await findSubject(body.subject);
  const deck = await Deck.create(body);
  res.status(201).json(toResponse(deck, subject, NO_CARDS));
}

/**
 * Replaces the editable fields: omitted optional fields go back to their defaults
 * (`color`, `dailyNewLimit = 10`, `archived = false`) and an omitted or empty `description` is cleared.
 */
export async function updateDeck(_req: Request, res: Response<DeckResponse>): Promise<void> {
  const { params, body } = getValidated(res, idAndBodyRules);
  const deck = await Deck.findById(params.id);
  if (!deck) throw new AppError(404, DECK_NOT_FOUND);
  const subject = await findSubject(body.subject);

  deck.title = body.title;
  deck.subject = subject._id;
  deck.description = body.description;
  deck.color = body.color ?? DEFAULT_DECK_COLOR;
  deck.dailyNewLimit = body.dailyNewLimit ?? DEFAULT_DAILY_NEW_LIMIT;
  deck.archived = body.archived ?? false;
  await deck.save();

  const counts = await countCards([deck._id], new Date());
  res.status(200).json(toResponse(deck, subject, counts.get(deck._id.toString()) ?? NO_CARDS));
}

/** Deletes a deck with its reviews, sessions and cards in one transaction (needs a replica set, as Atlas is). */
export async function deleteDeck(_req: Request, res: Response<MessageResponse>): Promise<void> {
  const { params } = getValidated(res, idRules);
  const deck = await Deck.findById(params.id).select({ _id: 1 }).lean();
  if (!deck) throw new AppError(404, DECK_NOT_FOUND);

  await runInTransaction(async (session) => {
    await Review.deleteMany({ deck: deck._id }, { session });
    await Session.deleteMany({ deck: deck._id }, { session });
    await Card.deleteMany({ deck: deck._id }, { session });
    const result = await Deck.deleteOne({ _id: deck._id }, { session });
    // Deleted by someone else since the check above: abort and report it as missing.
    if (result.deletedCount === 0) throw new AppError(404, DECK_NOT_FOUND);
  });
  res.status(200).json({ message: 'Deck deleted' });
}
