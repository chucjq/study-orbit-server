import type { Request, Response } from 'express';
import type { QueryFilter, Types } from 'mongoose';
import { z } from 'zod';
import { getValidated } from '../middleware/validate';
import { Deck, Review, Session, type SessionFields } from '../models';
import type { ListResponse, SessionResponse } from '../types/api';
import { SESSION_STATUSES, type SessionStatus } from '../types/domain';
import { AppError } from '../utils/appError';
import { idParamsSchema, objectIdSchema } from '../utils/objectId';
import { buildListResponse, DEFAULT_LIMIT_PAGED, paginationQuerySchema, toSkip } from '../utils/pagination';
import { sessionTotalsPipeline, summarize, type ReviewTotals } from '../utils/sessionSummary';

const SESSION_NOT_FOUND = 'Session not found';
const ALREADY_COMPLETED = 'Session is already completed';

// ---- Validation rules (also read by the routes) ----

export const listRules = {
  query: paginationQuerySchema(DEFAULT_LIMIT_PAGED).extend({
    deck: objectIdSchema.optional(),
    status: z.enum(SESSION_STATUSES).optional(),
  }),
};
export const idRules = { params: idParamsSchema };
export const createRules = { body: z.strictObject({ deck: objectIdSchema }) };
export const finishRules = { params: idParamsSchema, body: z.strictObject({ status: z.literal('completed') }) };

// ---- Response mapping ----

interface SessionLike {
  _id: Types.ObjectId;
  deck: Types.ObjectId;
  status: SessionStatus;
  startedAt: Date;
  endedAt?: Date | null | undefined;
  cardsReviewed: number;
  correctCount: number;
  accuracy: number;
  totalTimeMs: number;
  createdAt: Date;
  updatedAt: Date;
}

function toResponse(session: SessionLike): SessionResponse {
  return {
    _id: session._id.toString(),
    deck: session.deck.toString(),
    status: session.status,
    startedAt: session.startedAt.toISOString(),
    endedAt: session.endedAt ? session.endedAt.toISOString() : null,
    cardsReviewed: session.cardsReviewed,
    correctCount: session.correctCount,
    accuracy: session.accuracy,
    totalTimeMs: session.totalTimeMs,
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
  };
}

// ---- Handlers ----

export async function createSession(_req: Request, res: Response<SessionResponse>): Promise<void> {
  const { body } = getValidated(res, createRules);
  const deck = await Deck.findById(body.deck).select({ archived: 1 }).lean();
  if (!deck) throw new AppError(404, 'Deck not found');
  if (deck.archived) throw new AppError(400, 'Deck is archived');
  const session = await Session.create({ deck: deck._id });
  res.status(201).json(toResponse(session));
}

/** Newest first. A deck may have several active sessions; clients resume with `?status=active&deck=<id>`. */
export async function listSessions(_req: Request, res: Response<ListResponse<SessionResponse>>): Promise<void> {
  const { query } = getValidated(res, listRules);
  const filter: QueryFilter<SessionFields> = {
    ...(query.deck === undefined ? {} : { deck: query.deck }),
    ...(query.status === undefined ? {} : { status: query.status }),
  };
  const [sessions, total] = await Promise.all([
    Session.find(filter).sort({ startedAt: -1, _id: -1 }).skip(toSkip(query)).limit(query.limit).lean(),
    Session.countDocuments(filter),
  ]);
  res.status(200).json(buildListResponse(sessions.map(toResponse), total, query));
}

export async function getSession(_req: Request, res: Response<SessionResponse>): Promise<void> {
  const { params } = getValidated(res, idRules);
  const session = await Session.findById(params.id).lean();
  if (!session) throw new AppError(404, SESSION_NOT_FOUND);
  res.status(200).json(toResponse(session));
}

/** Finishes a session: stores a snapshot of its summary, taken from its reviews at this moment. */
export async function finishSession(_req: Request, res: Response<SessionResponse>): Promise<void> {
  const { params } = getValidated(res, finishRules);
  const session = await Session.findById(params.id).lean();
  if (!session) throw new AppError(404, SESSION_NOT_FOUND);
  if (session.status === 'completed') throw new AppError(400, ALREADY_COMPLETED);

  const [totals] = await Review.aggregate<ReviewTotals>(sessionTotalsPipeline(session._id));
  const summary = summarize(totals);

  // Only finish a session that is still active: a concurrent finish matches nothing here.
  const finished = await Session.findOneAndUpdate(
    { _id: session._id, status: 'active' },
    { $set: { status: 'completed', endedAt: new Date(), ...summary } },
    { returnDocument: 'after', runValidators: true },
  );
  if (!finished) throw new AppError(400, ALREADY_COMPLETED);
  res.status(200).json(toResponse(finished));
}
