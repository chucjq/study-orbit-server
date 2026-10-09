import type { Request, Response } from 'express';
import type { QueryFilter, Types } from 'mongoose';
import { z } from 'zod';
import { getValidated } from '../middleware/validate';
import { Deck, Subject, type SubjectFields } from '../models';
import { DEFAULT_SUBJECT_COLOR } from '../models/Subject';
import type { ListResponse, MessageResponse, SubjectResponse } from '../types/api';
import { AppError } from '../utils/appError';
import { HEX_COLOR } from '../models/validators';
import { idParamsSchema } from '../utils/objectId';
import { buildListResponse, DEFAULT_LIMIT_ALL, paginationQuerySchema, toSkip } from '../utils/pagination';
import { escapeRegex } from '../utils/regex';

const SUBJECT_NOT_FOUND = 'Subject not found';
const CASE_INSENSITIVE = { locale: 'en', strength: 2 } as const;

// ---- Validation rules (also read by the routes) ----

const bodySchema = z.strictObject({
  name: z.string().trim().min(2).max(40),
  color: z.string().regex(HEX_COLOR, 'must be a hex color like #6366f1').optional(),
  // An empty string clears the icon.
  icon: z
    .string()
    .trim()
    .max(4)
    .transform((value) => (value === '' ? undefined : value))
    .optional(),
});

export const listRules = {
  query: paginationQuerySchema(DEFAULT_LIMIT_ALL).extend({
    search: z.string().trim().optional(),
    sort: z.enum(['name', 'createdAt']).default('name'),
  }),
};
export const idRules = { params: idParamsSchema };
export const bodyRules = { body: bodySchema };
export const idAndBodyRules = { params: idParamsSchema, body: bodySchema };

// ---- Response mapping ----

interface SubjectLike {
  _id: Types.ObjectId;
  name: string;
  color: string;
  icon?: string | null | undefined;
  createdAt: Date;
  updatedAt: Date;
}

function toResponse(subject: SubjectLike, deckCount: number): SubjectResponse {
  return {
    _id: subject._id.toString(),
    name: subject.name,
    color: subject.color,
    ...(subject.icon ? { icon: subject.icon } : {}),
    deckCount,
    createdAt: subject.createdAt.toISOString(),
    updatedAt: subject.updatedAt.toISOString(),
  };
}

async function countDecks(subjectId: Types.ObjectId | string): Promise<number> {
  return Deck.countDocuments({ subject: subjectId });
}

/** Deck counts for a page of subjects in one query. */
async function countDecksBySubject(ids: Types.ObjectId[]): Promise<Map<string, number>> {
  const rows = await Deck.aggregate<{ _id: Types.ObjectId; count: number }>([
    { $match: { subject: { $in: ids } } },
    { $group: { _id: '$subject', count: { $sum: 1 } } },
  ]);
  return new Map(rows.map((row) => [row._id.toString(), row.count]));
}

// ---- Handlers ----

export async function listSubjects(_req: Request, res: Response<ListResponse<SubjectResponse>>): Promise<void> {
  const { query } = getValidated(res, listRules);
  const filter: QueryFilter<SubjectFields> = query.search
    ? { name: { $regex: escapeRegex(query.search), $options: 'i' } }
    : {};
  const sort: Record<string, 1> = query.sort === 'name' ? { name: 1, _id: 1 } : { createdAt: 1, _id: 1 };

  const [subjects, total] = await Promise.all([
    Subject.find(filter).collation(CASE_INSENSITIVE).sort(sort).skip(toSkip(query)).limit(query.limit).lean(),
    Subject.countDocuments(filter),
  ]);
  const counts = await countDecksBySubject(subjects.map((subject) => subject._id));
  const data = subjects.map((subject) => toResponse(subject, counts.get(subject._id.toString()) ?? 0));
  res.status(200).json(buildListResponse(data, total, query));
}

export async function getSubject(_req: Request, res: Response<SubjectResponse>): Promise<void> {
  const { params } = getValidated(res, idRules);
  const subject = await Subject.findById(params.id).lean();
  if (!subject) throw new AppError(404, SUBJECT_NOT_FOUND);
  res.status(200).json(toResponse(subject, await countDecks(subject._id)));
}

export async function createSubject(_req: Request, res: Response<SubjectResponse>): Promise<void> {
  const { body } = getValidated(res, bodyRules);
  const subject = await Subject.create(body);
  res.status(201).json(toResponse(subject, 0));
}

/** Replaces the editable fields: an omitted `color` resets to the default, an omitted `icon` is cleared. */
export async function updateSubject(_req: Request, res: Response<SubjectResponse>): Promise<void> {
  const { params, body } = getValidated(res, idAndBodyRules);
  const subject = await Subject.findById(params.id);
  if (!subject) throw new AppError(404, SUBJECT_NOT_FOUND);
  subject.name = body.name;
  subject.color = body.color ?? DEFAULT_SUBJECT_COLOR;
  subject.icon = body.icon;
  await subject.save();
  res.status(200).json(toResponse(subject, await countDecks(subject._id)));
}

export async function deleteSubject(_req: Request, res: Response<MessageResponse>): Promise<void> {
  const { params } = getValidated(res, idRules);
  const subject = await Subject.findById(params.id).lean();
  if (!subject) throw new AppError(404, SUBJECT_NOT_FOUND);
  if ((await countDecks(subject._id)) > 0) {
    throw new AppError(400, 'Cannot delete a subject that still has decks');
  }
  await Subject.deleteOne({ _id: subject._id });
  res.status(200).json({ message: 'Subject deleted' });
}
