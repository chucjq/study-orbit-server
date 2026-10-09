import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import mongoose from 'mongoose';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import app from '../app';
import { Card, Deck, Review } from '../models';
import { queryStub } from '../test/queryStub';

// The real app (routes, validation, error handler) against stubbed Mongoose models: these tests
// check the HTTP contract and the queries built, not the database itself.

const oid = (hex: string): mongoose.Types.ObjectId => new mongoose.Types.ObjectId(hex);
const DECK_ID = '64b7f0c2a1b2c3d4e5f60002';
const OTHER_DECK_ID = '64b7f0c2a1b2c3d4e5f60003';
const CARD_ID = '64b7f0c2a1b2c3d4e5f60010';
const NOW = new Date('2026-10-07T15:30:00.000Z');
const START = new Date('2026-10-07T00:00:00.000Z');
const END = new Date('2026-10-07T23:59:59.999Z');
const CREATED = new Date('2026-09-01T09:00:00.000Z');

function cardDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: oid(CARD_ID),
    deck: { _id: oid(DECK_ID), archived: false },
    front: '2 + 2?',
    back: '4',
    tags: ['math'],
    easeFactor: 2.5,
    intervalDays: 6,
    repetitions: 2,
    lapses: 0,
    dueDate: new Date('2026-10-04T00:00:00.000Z'),
    lastReviewedAt: new Date('2026-09-28T09:00:00.000Z'),
    status: 'review',
    suspended: false,
    createdAt: CREATED,
    updatedAt: CREATED,
    ...overrides,
  };
}

const expectedCard = {
  _id: CARD_ID,
  deck: DECK_ID,
  front: '2 + 2?',
  back: '4',
  tags: ['math'],
  easeFactor: 2.5,
  intervalDays: 6,
  repetitions: 2,
  lapses: 0,
  dueDate: '2026-10-04T00:00:00.000Z',
  lastReviewedAt: '2026-09-28T09:00:00.000Z',
  status: 'review',
  suspended: false,
  overdueDays: 3,
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

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
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

function stubList(options: { cards?: unknown[]; total?: number; activeIds?: mongoose.Types.ObjectId[] } = {}) {
  const list = queryStub(options.cards ?? []);
  const find = vi.spyOn(Card, 'find').mockReturnValue(list as unknown as ReturnType<typeof Card.find>);
  const count = vi
    .spyOn(Card, 'countDocuments')
    .mockReturnValue(
      queryStub(options.total ?? options.cards?.length ?? 0) as unknown as ReturnType<typeof Card.countDocuments>,
    );
  // The shared due filter looks up the non-archived decks through Deck.find.
  const activeDecks = vi
    .spyOn(Deck, 'find')
    .mockReturnValue(
      queryStub((options.activeIds ?? [oid(DECK_ID)]).map((_id) => ({ _id }))) as unknown as ReturnType<typeof Deck.find>,
    );
  return { list, find, count, activeDecks };
}
function stubCardById(result: unknown) {
  return vi.spyOn(Card, 'findById').mockReturnValue(queryStub(result) as unknown as ReturnType<typeof Card.findById>);
}
function stubDeckById(result: unknown) {
  return vi.spyOn(Deck, 'findById').mockReturnValue(queryStub(result) as unknown as ReturnType<typeof Deck.findById>);
}
/** A stand-in for a hydrated Mongoose document: plain fields plus `save` and `set`. */
function hydrated(overrides: Record<string, unknown> = {}) {
  const doc: Record<string, unknown> = { ...cardDoc({ deck: oid(DECK_ID) }), ...overrides };
  doc.save = vi.fn().mockResolvedValue(undefined);
  doc.set = vi.fn((key: string, value: unknown) => {
    doc[key] = value;
  });
  return doc as Record<string, unknown> & { save: ReturnType<typeof vi.fn>; set: ReturnType<typeof vi.fn> };
}

describe('GET /api/cards', () => {
  it('returns the envelope with the default sort, paging and derived overdueDays', async () => {
    const { list, find } = stubList({
      cards: [
        cardDoc(),
        cardDoc({ _id: oid(OTHER_DECK_ID), status: 'new', dueDate: new Date('2026-10-01T00:00:00.000Z'), lastReviewedAt: null }),
        cardDoc({ _id: oid(DECK_ID), suspended: true }),
        cardDoc({ deck: { _id: oid(DECK_ID), archived: true } }),
        cardDoc({ dueDate: new Date('2026-10-07T00:00:00.000Z') }),
      ],
      total: 41,
    });

    const { status, json } = await call('GET', '/api/cards');

    expect(status).toBe(200);
    const body = json as { data: Record<string, unknown>[]; total: number; page: number; limit: number };
    expect([body.total, body.page, body.limit]).toEqual([41, 1, 20]);
    expect(body.data[0]).toEqual(expectedCard);
    // overdueDays: 3 for the overdue card; 0 for new, suspended, archived-deck and due-today cards.
    expect(body.data.map((card) => card.overdueDays)).toEqual([3, 0, 0, 0, 0]);
    expect(body.data[1]).toMatchObject({ status: 'new', lastReviewedAt: null });
    expect(find).toHaveBeenCalledWith({});
    expect(list.populate).toHaveBeenCalledWith('deck', 'archived');
    expect(list.sort).toHaveBeenCalledWith({ dueDate: 1, _id: 1 });
    expect(list.skip).toHaveBeenCalledWith(0);
    expect(list.limit).toHaveBeenCalledWith(20);
  });

  it('applies the deck, status, tag, suspended and search filters, sorting and paging', async () => {
    const { list, find, count } = stubList({ cards: [], total: 0 });

    const { json } = await call(
      'GET',
      `/api/cards?deck=${DECK_ID}&status=review&tag=algebra&suspended=false&search=a.b&sort=lapses&order=desc&page=3&limit=5`,
    );

    expect(json).toEqual({ data: [], total: 0, page: 3, limit: 5 });
    const expected = {
      deck: DECK_ID,
      status: 'review',
      tags: 'algebra',
      suspended: false,
      $or: [
        { front: { $regex: 'a\\.b', $options: 'i' } },
        { back: { $regex: 'a\\.b', $options: 'i' } },
      ],
    };
    expect(find).toHaveBeenCalledWith(expected);
    expect(count).toHaveBeenCalledWith(expected);
    expect(list.sort).toHaveBeenCalledWith({ lapses: -1, _id: 1 });
    expect(list.skip).toHaveBeenCalledWith(10);
    expect(list.limit).toHaveBeenCalledWith(5);
  });

  it.each([
    ['overdue', { $lt: START }],
    ['today', { $gte: START, $lte: END }],
    ['upcoming', { $gt: END }],
  ])('due=%s goes through the shared due filter', async (bucket, dueDate) => {
    const { find, activeDecks } = stubList({ cards: [], activeIds: [oid(DECK_ID)] });

    await call('GET', `/api/cards?due=${bucket}&tag=algebra`);

    expect(activeDecks).toHaveBeenCalledWith({ archived: false });
    expect(find).toHaveBeenCalledWith({
      $and: [
        { status: { $ne: 'new' }, suspended: false, dueDate, deck: { $in: [oid(DECK_ID)] } },
        { tags: 'algebra' },
      ],
    });
  });

  it('narrows the due filter to the requested deck', async () => {
    const { activeDecks } = stubList({ cards: [] });
    await call('GET', `/api/cards?due=today&deck=${DECK_ID}`);
    expect(activeDecks).toHaveBeenCalledWith({ _id: DECK_ID, archived: false });
  });

  it.each([
    ['status=forgotten', /^status: /],
    ['due=soon', /^due: /],
    ['suspended=maybe', /^suspended: /],
    ['sort=banana', /^sort: /],
    ['order=up', /^order: /],
    ['limit=101', /^limit: /],
    ['page=0', /^page: /],
    ['deck=nope', /^Invalid ID$/],
  ])('rejects %s with 400 before querying', async (query, message) => {
    const find = vi.spyOn(Card, 'find');
    const { status, json } = await call('GET', `/api/cards?${query}`);
    expect(status).toBe(400);
    expect((json as { message: string }).message).toMatch(message);
    expect(find).not.toHaveBeenCalled();
  });
});

describe('GET /api/decks/:id/cards', () => {
  it('lists the cards of one deck with the same filters', async () => {
    stubDeckById({ _id: oid(DECK_ID), archived: false });
    const { find } = stubList({ cards: [cardDoc()], total: 1 });

    const { status, json } = await call('GET', `/api/decks/${DECK_ID}/cards?status=review&sort=createdAt&order=desc`);

    expect(status).toBe(200);
    expect(json).toEqual({ data: [expectedCard], total: 1, page: 1, limit: 20 });
    expect(find).toHaveBeenCalledWith({ deck: DECK_ID, status: 'review' });
  });

  it('ignores a deck query parameter: the path decides the deck', async () => {
    stubDeckById({ _id: oid(DECK_ID), archived: false });
    const { find } = stubList({ cards: [] });
    await call('GET', `/api/decks/${DECK_ID}/cards?deck=${OTHER_DECK_ID}`);
    expect(find).toHaveBeenCalledWith({ deck: DECK_ID });
  });

  it('returns 404 for a missing deck without querying cards, and 400 for a malformed id', async () => {
    stubDeckById(null);
    const find = vi.spyOn(Card, 'find');
    expect(await call('GET', `/api/decks/${DECK_ID}/cards`)).toEqual({ status: 404, json: { message: 'Deck not found' } });
    expect(await call('GET', '/api/decks/nope/cards')).toEqual({ status: 400, json: { message: 'Invalid ID' } });
    expect(find).not.toHaveBeenCalled();
  });
});

describe('GET /api/cards/:id', () => {
  it('returns the card', async () => {
    stubCardById(cardDoc());
    expect(await call('GET', `/api/cards/${CARD_ID}`)).toEqual({ status: 200, json: expectedCard });
  });

  it('returns 404 for an unknown card and 400 "Invalid ID" for a malformed id', async () => {
    stubCardById(null);
    expect(await call('GET', `/api/cards/${CARD_ID}`)).toEqual({ status: 404, json: { message: 'Card not found' } });
    expect(await call('GET', '/api/cards/123')).toEqual({ status: 400, json: { message: 'Invalid ID' } });
  });
});

describe('POST /api/cards', () => {
  const valid = { deck: DECK_ID, front: '  2 + 2?  ', back: '4', tags: ['math'] };

  it('creates a card and returns 201', async () => {
    stubDeckById({ _id: oid(DECK_ID), archived: false });
    const create = vi.spyOn(Card, 'create').mockResolvedValue(
      cardDoc({ status: 'new', intervalDays: 0, repetitions: 0, lastReviewedAt: null, dueDate: START }) as never,
    );

    const { status, json } = await call('POST', '/api/cards', valid);

    expect(status).toBe(201);
    expect(json).toMatchObject({ _id: CARD_ID, deck: DECK_ID, status: 'new', overdueDays: 0, dueDate: START.toISOString() });
    expect(create).toHaveBeenCalledWith({ deck: DECK_ID, front: '2 + 2?', back: '4', tags: ['math'] });
  });

  it('returns 404 "Deck not found" for an unknown deck and writes nothing', async () => {
    stubDeckById(null);
    const create = vi.spyOn(Card, 'create');
    expect(await call('POST', '/api/cards', valid)).toEqual({ status: 404, json: { message: 'Deck not found' } });
    expect(create).not.toHaveBeenCalled();
  });

  const base = { deck: DECK_ID, front: 'Q', back: 'A' };
  it.each([
    ['a missing front', { deck: DECK_ID, back: 'A' }, /^front: /],
    ['a whitespace-only front', { ...base, front: '   ' }, /^front: /],
    ['a front over 500 characters', { ...base, front: 'x'.repeat(501) }, /^front: /],
    ['a missing back', { deck: DECK_ID, front: 'Q' }, /^back: /],
    ['a back over 1000 characters', { ...base, back: 'x'.repeat(1001) }, /^back: /],
    ['a missing deck', { front: 'Q', back: 'A' }, /^deck: /],
    ['a malformed deck id', { ...base, deck: 'nope' }, /^Invalid ID$/],
    ['tags that are not an array', { ...base, tags: 'math' }, /^tags: /],
    ['more than 10 tags', { ...base, tags: Array.from({ length: 11 }, (_, i) => `t${i}`) }, /^tags: /],
    ['an empty tag', { ...base, tags: ['ok', '  '] }, /^tags\.1: /],
  ])('rejects %s with 400 before any database call', async (_label, body, message) => {
    const deckById = vi.spyOn(Deck, 'findById');
    const create = vi.spyOn(Card, 'create');
    const { status, json } = await call('POST', '/api/cards', body);
    expect(status).toBe(400);
    expect((json as { message: string }).message).toMatch(message);
    expect(deckById).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it.each([
    'easeFactor',
    'intervalDays',
    'repetitions',
    'lapses',
    'dueDate',
    'status',
    'suspended',
    'lastReviewedAt',
  ])('rejects the scheduling/system field %s, naming it', async (field) => {
    const create = vi.spyOn(Card, 'create');
    const { status, json } = await call('POST', '/api/cards', { ...base, [field]: 'x' });
    expect(status).toBe(400);
    expect(json).toEqual({ message: `Unknown field: ${field}` });
    expect(create).not.toHaveBeenCalled();
  });

  it('accepts exactly 10 tags', async () => {
    stubDeckById({ _id: oid(DECK_ID), archived: false });
    vi.spyOn(Card, 'create').mockResolvedValue(cardDoc() as never);
    const tags = Array.from({ length: 10 }, (_, i) => `t${i}`);
    expect((await call('POST', '/api/cards', { ...base, tags })).status).toBe(201);
  });
});

describe('PUT /api/cards/:id', () => {
  const body = { deck: OTHER_DECK_ID, front: ' New front ', back: 'New back' };

  it('replaces the editable fields (omitted tags become []) and leaves scheduling untouched', async () => {
    const doc = hydrated();
    stubCardById(doc);
    stubDeckById({ _id: oid(OTHER_DECK_ID), archived: false });

    const { status, json } = await call('PUT', `/api/cards/${CARD_ID}`, body);

    expect(status).toBe(200);
    expect(doc).toMatchObject({
      deck: oid(OTHER_DECK_ID),
      front: 'New front',
      back: 'New back',
      tags: [],
      // untouched scheduling state
      easeFactor: 2.5,
      intervalDays: 6,
      repetitions: 2,
      lapses: 0,
      status: 'review',
      dueDate: new Date('2026-10-04T00:00:00.000Z'),
    });
    expect(doc.set).toHaveBeenCalledWith('tags', []);
    expect(doc.save).toHaveBeenCalledOnce();
    expect(json).toMatchObject({ _id: CARD_ID, deck: OTHER_DECK_ID, front: 'New front', tags: [], overdueDays: 3 });
  });

  it('keeps the tags it is given', async () => {
    const doc = hydrated();
    stubCardById(doc);
    stubDeckById({ _id: oid(OTHER_DECK_ID), archived: false });
    await call('PUT', `/api/cards/${CARD_ID}`, { ...body, tags: ['a', 'b'] });
    expect(doc.set).toHaveBeenCalledWith('tags', ['a', 'b']);
  });

  it('reports overdueDays 0 when the target deck is archived', async () => {
    stubCardById(hydrated());
    stubDeckById({ _id: oid(OTHER_DECK_ID), archived: true });
    const { json } = await call('PUT', `/api/cards/${CARD_ID}`, body);
    expect(json).toMatchObject({ overdueDays: 0 });
  });

  it('returns 404 for an unknown card and 404 "Deck not found" for an unknown deck, without saving', async () => {
    stubCardById(null);
    expect(await call('PUT', `/api/cards/${CARD_ID}`, body)).toEqual({ status: 404, json: { message: 'Card not found' } });

    const doc = hydrated();
    stubCardById(doc);
    stubDeckById(null);
    expect(await call('PUT', `/api/cards/${CARD_ID}`, body)).toEqual({ status: 404, json: { message: 'Deck not found' } });
    expect(doc.save).not.toHaveBeenCalled();
  });

  it.each([
    ['a missing front', { deck: DECK_ID, back: 'A' }, /^front: /],
    ['a missing back', { deck: DECK_ID, front: 'Q' }, /^back: /],
    ['a missing deck', { front: 'Q', back: 'A' }, /^deck: /],
    ['a scheduling field', { ...body, easeFactor: 3 }, /^Unknown field: easeFactor$/],
    ['a status', { ...body, status: 'mastered' }, /^Unknown field: status$/],
  ])('rejects %s with 400 before querying', async (_label, bad, message) => {
    const findById = vi.spyOn(Card, 'findById');
    const { status, json } = await call('PUT', `/api/cards/${CARD_ID}`, bad);
    expect(status).toBe(400);
    expect((json as { message: string }).message).toMatch(message);
    expect(findById).not.toHaveBeenCalled();
  });

  it('returns 400 "Invalid ID" for a malformed card id', async () => {
    expect(await call('PUT', '/api/cards/nope', body)).toEqual({ status: 400, json: { message: 'Invalid ID' } });
  });
});

describe('DELETE /api/cards/:id', () => {
  function stubTransaction() {
    const session = {
      withTransaction: vi.fn(async (work: () => Promise<void>) => {
        await work();
      }),
      endSession: vi.fn().mockResolvedValue(undefined),
    };
    vi.spyOn(mongoose, 'startSession').mockResolvedValue(session as never);
    const reviews = vi.spyOn(Review, 'deleteMany').mockResolvedValue({ deletedCount: 4 } as never);
    const card = vi.spyOn(Card, 'deleteOne').mockResolvedValue({ deletedCount: 1 } as never);
    return { session, reviews, card };
  }

  it("deletes the card's reviews and then the card inside one transaction", async () => {
    stubCardById({ _id: oid(CARD_ID) });
    const { session, reviews, card } = stubTransaction();

    expect(await call('DELETE', `/api/cards/${CARD_ID}`)).toEqual({ status: 200, json: { message: 'Card deleted' } });

    expect(session.withTransaction).toHaveBeenCalledOnce();
    expect(reviews).toHaveBeenCalledWith({ card: oid(CARD_ID) }, { session });
    expect(card).toHaveBeenCalledWith({ _id: oid(CARD_ID) }, { session });
    expect(reviews.mock.invocationCallOrder[0]).toBeLessThan(card.mock.invocationCallOrder[0] ?? 0);
    expect(session.endSession).toHaveBeenCalledOnce();
  });

  it('returns 404 for an unknown card without opening a transaction', async () => {
    stubCardById(null);
    const startSession = vi.spyOn(mongoose, 'startSession');
    expect(await call('DELETE', `/api/cards/${CARD_ID}`)).toEqual({ status: 404, json: { message: 'Card not found' } });
    expect(startSession).not.toHaveBeenCalled();
  });

  it('returns 404 and ends the session when the card vanished before the transaction deleted it', async () => {
    stubCardById({ _id: oid(CARD_ID) });
    const { session, card } = stubTransaction();
    card.mockResolvedValue({ deletedCount: 0 } as never);
    expect(await call('DELETE', `/api/cards/${CARD_ID}`)).toEqual({ status: 404, json: { message: 'Card not found' } });
    expect(session.endSession).toHaveBeenCalledOnce();
  });

  it('a failure while deleting reviews aborts with 500 and never deletes the card', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    stubCardById({ _id: oid(CARD_ID) });
    const { session, reviews, card } = stubTransaction();
    reviews.mockRejectedValue(new Error('connection lost'));

    expect(await call('DELETE', `/api/cards/${CARD_ID}`)).toEqual({
      status: 500,
      json: { message: 'Internal server error' },
    });
    expect(card).not.toHaveBeenCalled();
    expect(session.endSession).toHaveBeenCalledOnce();
  });

  it('returns 400 "Invalid ID" for a malformed id', async () => {
    expect(await call('DELETE', '/api/cards/xyz')).toEqual({ status: 400, json: { message: 'Invalid ID' } });
  });
});

describe('PATCH /api/cards/:id/suspension', () => {
  it('suspends a card and changes nothing else', async () => {
    const doc = hydrated();
    stubCardById(doc);
    stubDeckById({ _id: oid(DECK_ID), archived: false });

    const { status, json } = await call('PATCH', `/api/cards/${CARD_ID}/suspension`, { suspended: true });

    expect(status).toBe(200);
    expect(doc).toMatchObject({
      suspended: true,
      status: 'review',
      easeFactor: 2.5,
      intervalDays: 6,
      repetitions: 2,
      dueDate: new Date('2026-10-04T00:00:00.000Z'),
    });
    expect(doc.save).toHaveBeenCalledOnce();
    // A suspended card is never overdue, whatever its due date.
    expect(json).toMatchObject({ _id: CARD_ID, suspended: true, status: 'review', overdueDays: 0 });
  });

  it('unsuspending restores the card exactly as it was (overdue again)', async () => {
    stubCardById(hydrated({ suspended: true }));
    stubDeckById({ _id: oid(DECK_ID), archived: false });
    const { json } = await call('PATCH', `/api/cards/${CARD_ID}/suspension`, { suspended: false });
    expect(json).toEqual(expectedCard);
  });

  it.each([
    ['a non-boolean', { suspended: 'yes' }, /^suspended: /],
    ['a number', { suspended: 1 }, /^suspended: /],
    ['a missing field', {}, /^suspended: /],
    ['an extra field', { suspended: true, status: 'new' }, /^Unknown field: status$/],
  ])('rejects %s with 400 before querying', async (_label, body, message) => {
    const findById = vi.spyOn(Card, 'findById');
    const { status, json } = await call('PATCH', `/api/cards/${CARD_ID}/suspension`, body);
    expect(status).toBe(400);
    expect((json as { message: string }).message).toMatch(message);
    expect(findById).not.toHaveBeenCalled();
  });

  it('returns 404 for an unknown card and 400 "Invalid ID" for a malformed id', async () => {
    stubCardById(null);
    expect(await call('PATCH', `/api/cards/${CARD_ID}/suspension`, { suspended: true })).toEqual({
      status: 404,
      json: { message: 'Card not found' },
    });
    expect(await call('PATCH', '/api/cards/xyz/suspension', { suspended: true })).toEqual({
      status: 400,
      json: { message: 'Invalid ID' },
    });
  });
});
