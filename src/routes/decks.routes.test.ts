import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import mongoose from 'mongoose';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import app from '../app';
import { Card, Deck, Review, Session, Subject } from '../models';
import { queryStub } from '../test/queryStub';

// The real app (routes, validation, error handler) against stubbed Mongoose models: these tests
// check the HTTP contract and the queries built, not the database itself.

const oid = (hex: string): mongoose.Types.ObjectId => new mongoose.Types.ObjectId(hex);
const SUBJECT_ID = '64b7f0c2a1b2c3d4e5f60001';
const DECK_ID = '64b7f0c2a1b2c3d4e5f60002';
const OTHER_DECK_ID = '64b7f0c2a1b2c3d4e5f60003';
const CREATED = new Date('2026-10-01T09:00:00.000Z');

const subjectSummary = { _id: oid(SUBJECT_ID), name: 'Math', color: '#6366f1' };

function deckDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: oid(DECK_ID),
    title: 'Algebra',
    subject: subjectSummary,
    description: 'Basics',
    color: '#0ea5e9',
    dailyNewLimit: 10,
    archived: false,
    createdAt: CREATED,
    updatedAt: CREATED,
    ...overrides,
  };
}

const expectedDeck = {
  _id: DECK_ID,
  title: 'Algebra',
  subject: { _id: SUBJECT_ID, name: 'Math', color: '#6366f1' },
  description: 'Basics',
  color: '#0ea5e9',
  dailyNewLimit: 10,
  archived: false,
  cardCount: 0,
  dueCount: 0,
  createdAt: CREATED.toISOString(),
  updatedAt: CREATED.toISOString(),
};

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  server.close();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
});

async function call(method: string, path: string, body?: unknown): Promise<{ status: number; json: unknown }> {
  const response = await fetch(baseUrl + path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, json: await response.json() };
}

type Filter = Record<string, unknown>;
type Pipeline = { $match: Filter }[];

/**
 * Stubs everything a deck read touches. `Deck.find` is used twice: the list query itself
 * (no `_id` in the filter) and the shared due filter's lookup of non-archived decks.
 */
function stubReads(options: {
  decks?: unknown[];
  total?: number;
  activeIds?: mongoose.Types.ObjectId[];
  cardRows?: { _id: mongoose.Types.ObjectId; count: number }[];
  dueRows?: { _id: mongoose.Types.ObjectId; count: number }[];
}) {
  const list = queryStub(options.decks ?? []);
  const active = queryStub((options.activeIds ?? []).map((_id) => ({ _id })));
  const find = vi.spyOn(Deck, 'find').mockImplementation(((filter: Filter) =>
    '_id' in filter ? active : list) as unknown as typeof Deck.find);
  vi.spyOn(Deck, 'countDocuments').mockReturnValue(
    queryStub(options.total ?? options.decks?.length ?? 0) as unknown as ReturnType<typeof Deck.countDocuments>,
  );
  const aggregate = vi.spyOn(Card, 'aggregate').mockImplementation(((pipeline: Pipeline) =>
    Promise.resolve('status' in (pipeline[0]?.$match ?? {}) ? (options.dueRows ?? []) : (options.cardRows ?? []))) as never);
  return { list, find, aggregate };
}

function stubDeckById(result: unknown) {
  return vi
    .spyOn(Deck, 'findById')
    .mockReturnValue(queryStub(result) as unknown as ReturnType<typeof Deck.findById>);
}
function stubSubjectById(result: unknown) {
  return vi
    .spyOn(Subject, 'findById')
    .mockReturnValue(queryStub(result) as unknown as ReturnType<typeof Subject.findById>);
}
function duplicateKeyError(): Error {
  return new mongoose.mongo.MongoServerError({
    message: 'E11000 duplicate key',
    code: 11000,
    keyValue: { subject: SUBJECT_ID, title: 'Algebra' },
  });
}

describe('GET /api/decks', () => {
  it('returns the envelope with populated subject, cardCount and dueCount (shared due filter)', async () => {
    const { list, find, aggregate } = stubReads({
      decks: [deckDoc(), deckDoc({ _id: oid(OTHER_DECK_ID), title: 'Geometry', description: undefined })],
      activeIds: [oid(DECK_ID), oid(OTHER_DECK_ID)],
      cardRows: [{ _id: oid(DECK_ID), count: 12 }],
      dueRows: [{ _id: oid(DECK_ID), count: 4 }],
    });

    const { status, json } = await call('GET', '/api/decks');

    expect(status).toBe(200);
    const body = json as { data: Record<string, unknown>[]; total: number; page: number; limit: number };
    expect([body.total, body.page, body.limit]).toEqual([2, 1, 100]);
    expect(body.data[0]).toEqual({ ...expectedDeck, cardCount: 12, dueCount: 4 });
    expect(body.data[1]).toMatchObject({ title: 'Geometry', cardCount: 0, dueCount: 0 });
    expect(body.data[1]).not.toHaveProperty('description');

    expect(find).toHaveBeenCalledWith({});
    expect(list.populate).toHaveBeenCalledWith('subject', 'name color');
    expect(list.sort).toHaveBeenCalledWith({ title: 1, _id: 1 });
    expect(list.collation).toHaveBeenCalledWith({ locale: 'en', strength: 2 });
    expect(list.skip).toHaveBeenCalledWith(0);
    expect(list.limit).toHaveBeenCalledWith(100);
    // The due count goes through the shared filter: non-new, not suspended, due by end of today,
    // and only decks that the archived-deck lookup returned.
    expect(find).toHaveBeenCalledWith({ _id: { $in: [oid(DECK_ID), oid(OTHER_DECK_ID)] }, archived: false });
    const dueMatch = (aggregate.mock.calls.map(([pipeline]) => (pipeline as Pipeline)[0]?.$match) as Filter[]).find(
      (match) => 'status' in match,
    );
    expect(dueMatch).toMatchObject({
      status: { $ne: 'new' },
      suspended: false,
      dueDate: { $lte: expect.any(Date) as Date },
      deck: { $in: [oid(DECK_ID), oid(OTHER_DECK_ID)] },
    });
  });

  it('reports dueCount 0 for an archived deck (it is left out of the due filter)', async () => {
    const { aggregate } = stubReads({
      decks: [deckDoc({ archived: true })],
      activeIds: [],
      cardRows: [{ _id: oid(DECK_ID), count: 5 }],
    });

    const { json } = await call('GET', '/api/decks');

    expect((json as { data: unknown[] }).data[0]).toMatchObject({ archived: true, cardCount: 5, dueCount: 0 });
    const dueMatch = (aggregate.mock.calls.map(([pipeline]) => (pipeline as Pipeline)[0]?.$match) as Filter[]).find(
      (match) => 'status' in match,
    );
    expect(dueMatch?.deck).toEqual({ $in: [] });
  });

  it('applies the archived, subject and search filters, sorting and pagination', async () => {
    const { list, find, aggregate } = stubReads({ decks: [], total: 0 });

    const { status, json } = await call(
      'GET',
      `/api/decks?archived=false&subject=${SUBJECT_ID}&search=al.g&sort=createdAt&page=2&limit=5`,
    );

    expect(status).toBe(200);
    expect(json).toEqual({ data: [], total: 0, page: 2, limit: 5 });
    expect(find).toHaveBeenCalledWith({
      archived: false,
      subject: SUBJECT_ID,
      title: { $regex: 'al\\.g', $options: 'i' },
    });
    expect(list.sort).toHaveBeenCalledWith({ createdAt: 1, _id: 1 });
    expect(list.skip).toHaveBeenCalledWith(5);
    expect(list.limit).toHaveBeenCalledWith(5);
    expect(aggregate).not.toHaveBeenCalled();
  });

  it('filters archived=true', async () => {
    const { find } = stubReads({ decks: [] });
    await call('GET', '/api/decks?archived=true');
    expect(find).toHaveBeenCalledWith({ archived: true });
  });

  it.each([
    ['archived=maybe', /^archived: /],
    ['subject=nope', /^Invalid ID$/],
    ['sort=banana', /^sort: /],
    ['limit=101', /^limit: /],
    ['page=0', /^page: /],
  ])('rejects %s with 400', async (query, message) => {
    const find = vi.spyOn(Deck, 'find');
    const { status, json } = await call('GET', `/api/decks?${query}`);
    expect(status).toBe(400);
    expect((json as { message: string }).message).toMatch(message);
    expect(find).not.toHaveBeenCalled();
  });
});

describe('GET /api/decks/:id', () => {
  it('returns the deck in the same shape as a list item', async () => {
    stubDeckById(deckDoc());
    stubReads({
      activeIds: [oid(DECK_ID)],
      cardRows: [{ _id: oid(DECK_ID), count: 7 }],
      dueRows: [{ _id: oid(DECK_ID), count: 2 }],
    });
    expect(await call('GET', `/api/decks/${DECK_ID}`)).toEqual({
      status: 200,
      json: { ...expectedDeck, cardCount: 7, dueCount: 2 },
    });
  });

  it('returns 404 for an unknown deck and 400 "Invalid ID" for a malformed id', async () => {
    const findById = stubDeckById(null);
    expect(await call('GET', `/api/decks/${DECK_ID}`)).toEqual({ status: 404, json: { message: 'Deck not found' } });
    findById.mockClear();
    expect(await call('GET', '/api/decks/123')).toEqual({ status: 400, json: { message: 'Invalid ID' } });
    expect(findById).not.toHaveBeenCalled();
  });
});

describe('POST /api/decks', () => {
  const valid = { title: '  Algebra  ', subject: SUBJECT_ID };

  it('creates a deck and returns 201 with the populated subject and zero counts', async () => {
    stubSubjectById(subjectSummary);
    const create = vi.spyOn(Deck, 'create').mockResolvedValue(deckDoc() as never);

    expect(await call('POST', '/api/decks', valid)).toEqual({ status: 201, json: expectedDeck });
    expect(create).toHaveBeenCalledWith({ title: 'Algebra', subject: SUBJECT_ID });
  });

  it('returns 404 "Subject not found" when the subject does not exist, and writes nothing', async () => {
    stubSubjectById(null);
    const create = vi.spyOn(Deck, 'create');
    expect(await call('POST', '/api/decks', valid)).toEqual({ status: 404, json: { message: 'Subject not found' } });
    expect(create).not.toHaveBeenCalled();
  });

  it.each([
    ['a missing title', { subject: SUBJECT_ID }, /^title: /],
    ['a title that is too short', { title: 'ab', subject: SUBJECT_ID }, /^title: /],
    ['a title that is too long', { title: 'x'.repeat(61), subject: SUBJECT_ID }, /^title: /],
    ['a missing subject', { title: 'Algebra' }, /^subject: /],
    ['a malformed subject id', { title: 'Algebra', subject: 'nope' }, /^Invalid ID$/],
    ['a description over 300 characters', { ...valid, description: 'x'.repeat(301) }, /^description: /],
    ['an invalid color', { ...valid, color: 'blue' }, /^color: /],
    ['dailyNewLimit 0', { ...valid, dailyNewLimit: 0 }, /^dailyNewLimit: /],
    ['dailyNewLimit 101', { ...valid, dailyNewLimit: 101 }, /^dailyNewLimit: /],
    ['a fractional dailyNewLimit', { ...valid, dailyNewLimit: 2.5 }, /^dailyNewLimit: /],
    ['a non-boolean archived', { ...valid, archived: 'yes' }, /^archived: /],
    ['an unknown field', { ...valid, cardCount: 3 }, /^Unknown field: cardCount$/],
  ])('rejects %s with 400 before any database call', async (_label, body, message) => {
    const subjectById = vi.spyOn(Subject, 'findById');
    const create = vi.spyOn(Deck, 'create');
    const { status, json } = await call('POST', '/api/decks', body);
    expect(status).toBe(400);
    expect((json as { message: string }).message).toMatch(message);
    expect(subjectById).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it('returns 400 for a duplicate title within the subject', async () => {
    stubSubjectById(subjectSummary);
    vi.spyOn(Deck, 'create').mockRejectedValue(duplicateKeyError());
    expect(await call('POST', '/api/decks', valid)).toEqual({
      status: 400,
      json: { message: 'Duplicate value for: subject, title' },
    });
  });
});

describe('PUT /api/decks/:id', () => {
  const OTHER_SUBJECT_ID = '64b7f0c2a1b2c3d4e5f60009';

  it('replaces the editable fields, resets omitted ones to defaults and moves the deck', async () => {
    const doc = {
      ...deckDoc({ color: '#ff0000', dailyNewLimit: 40, archived: true }),
      save: vi.fn().mockResolvedValue(undefined),
    };
    stubDeckById(doc);
    stubSubjectById({ _id: oid(OTHER_SUBJECT_ID), name: 'Art', color: '#111111' });
    stubReads({ activeIds: [], cardRows: [{ _id: oid(DECK_ID), count: 3 }] });

    const { status, json } = await call('PUT', `/api/decks/${DECK_ID}`, { title: 'Sketching', subject: OTHER_SUBJECT_ID });

    expect(status).toBe(200);
    expect(doc).toMatchObject({
      title: 'Sketching',
      subject: oid(OTHER_SUBJECT_ID),
      description: undefined,
      color: '#0ea5e9',
      dailyNewLimit: 10,
      archived: false,
    });
    expect(doc.save).toHaveBeenCalledOnce();
    expect(json).toMatchObject({
      _id: DECK_ID,
      title: 'Sketching',
      subject: { _id: OTHER_SUBJECT_ID, name: 'Art', color: '#111111' },
      cardCount: 3,
      dueCount: 0,
    });
    expect(json).not.toHaveProperty('description');
  });

  it('keeps the values it is given', async () => {
    const doc = { ...deckDoc(), save: vi.fn().mockResolvedValue(undefined) };
    stubDeckById(doc);
    stubSubjectById(subjectSummary);
    stubReads({});
    await call('PUT', `/api/decks/${DECK_ID}`, {
      title: 'Algebra II',
      subject: SUBJECT_ID,
      description: 'Harder',
      color: '#123456',
      dailyNewLimit: 25,
      archived: true,
    });
    expect(doc).toMatchObject({ description: 'Harder', color: '#123456', dailyNewLimit: 25, archived: true });
  });

  it('returns 404 for an unknown deck and 404 for an unknown subject, without saving', async () => {
    stubDeckById(null);
    expect(await call('PUT', `/api/decks/${DECK_ID}`, { title: 'Algebra', subject: SUBJECT_ID })).toEqual({
      status: 404,
      json: { message: 'Deck not found' },
    });

    const doc = { ...deckDoc(), save: vi.fn() };
    stubDeckById(doc);
    stubSubjectById(null);
    expect(await call('PUT', `/api/decks/${DECK_ID}`, { title: 'Algebra', subject: SUBJECT_ID })).toEqual({
      status: 404,
      json: { message: 'Subject not found' },
    });
    expect(doc.save).not.toHaveBeenCalled();
  });

  it('returns 400 when moving to a subject that already has a deck with that title', async () => {
    stubDeckById({ ...deckDoc(), save: vi.fn().mockRejectedValue(duplicateKeyError()) });
    stubSubjectById(subjectSummary);
    expect(await call('PUT', `/api/decks/${DECK_ID}`, { title: 'Algebra', subject: SUBJECT_ID })).toEqual({
      status: 400,
      json: { message: 'Duplicate value for: subject, title' },
    });
  });

  it('validates the id and the body before querying', async () => {
    const findById = vi.spyOn(Deck, 'findById');
    expect(await call('PUT', '/api/decks/nope', { title: 'Algebra', subject: SUBJECT_ID })).toEqual({
      status: 400,
      json: { message: 'Invalid ID' },
    });
    expect((await call('PUT', `/api/decks/${DECK_ID}`, {})).status).toBe(400);
    expect(findById).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/decks/:id', () => {
  function stubTransaction() {
    const session = {
      withTransaction: vi.fn(async (work: () => Promise<void>) => {
        await work();
      }),
      endSession: vi.fn().mockResolvedValue(undefined),
    };
    vi.spyOn(mongoose, 'startSession').mockResolvedValue(session as never);
    const reviews = vi.spyOn(Review, 'deleteMany').mockResolvedValue({ deletedCount: 9 } as never);
    const sessions = vi.spyOn(Session, 'deleteMany').mockResolvedValue({ deletedCount: 2 } as never);
    const cards = vi.spyOn(Card, 'deleteMany').mockResolvedValue({ deletedCount: 5 } as never);
    const deck = vi.spyOn(Deck, 'deleteOne').mockResolvedValue({ deletedCount: 1 } as never);
    return { session, reviews, sessions, cards, deck };
  }

  it('deletes reviews, sessions, cards, then the deck, all inside one transaction', async () => {
    stubDeckById({ _id: oid(DECK_ID) });
    const { session, reviews, sessions, cards, deck } = stubTransaction();

    expect(await call('DELETE', `/api/decks/${DECK_ID}`)).toEqual({ status: 200, json: { message: 'Deck deleted' } });

    expect(session.withTransaction).toHaveBeenCalledOnce();
    expect(reviews).toHaveBeenCalledWith({ deck: oid(DECK_ID) }, { session });
    expect(sessions).toHaveBeenCalledWith({ deck: oid(DECK_ID) }, { session });
    expect(cards).toHaveBeenCalledWith({ deck: oid(DECK_ID) }, { session });
    expect(deck).toHaveBeenCalledWith({ _id: oid(DECK_ID) }, { session });
    const order = [reviews, sessions, cards, deck].map((spy) => spy.mock.invocationCallOrder[0] ?? 0);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(session.endSession).toHaveBeenCalledOnce();
  });

  it('returns 404 for an unknown deck without opening a transaction', async () => {
    stubDeckById(null);
    const startSession = vi.spyOn(mongoose, 'startSession');
    expect(await call('DELETE', `/api/decks/${DECK_ID}`)).toEqual({ status: 404, json: { message: 'Deck not found' } });
    expect(startSession).not.toHaveBeenCalled();
  });

  it('returns 404 and ends the session when the deck vanished before the transaction deleted it', async () => {
    stubDeckById({ _id: oid(DECK_ID) });
    const { session, deck } = stubTransaction();
    deck.mockResolvedValue({ deletedCount: 0 } as never);
    expect(await call('DELETE', `/api/decks/${DECK_ID}`)).toEqual({ status: 404, json: { message: 'Deck not found' } });
    expect(session.endSession).toHaveBeenCalledOnce();
  });

  it('a failure part-way aborts with 500, never deletes the deck, and ends the session', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    stubDeckById({ _id: oid(DECK_ID) });
    const { session, cards, deck } = stubTransaction();
    cards.mockRejectedValue(new Error('connection lost'));

    expect(await call('DELETE', `/api/decks/${DECK_ID}`)).toEqual({
      status: 500,
      json: { message: 'Internal server error' },
    });
    expect(deck).not.toHaveBeenCalled();
    expect(session.endSession).toHaveBeenCalledOnce();
  });

  it('returns 400 "Invalid ID" for a malformed id', async () => {
    expect(await call('DELETE', '/api/decks/xyz')).toEqual({ status: 400, json: { message: 'Invalid ID' } });
  });
});
