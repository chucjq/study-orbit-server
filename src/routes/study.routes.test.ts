import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import mongoose from 'mongoose';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import app from '../app';
import { Card, Deck, Review } from '../models';
import { queryStub, type QueryStub } from '../test/queryStub';

// The real app against stubbed Mongoose models: these tests check the queue's rules and the
// queries it builds, not the database itself.

const oid = (hex: string): mongoose.Types.ObjectId => new mongoose.Types.ObjectId(hex);
const DECK_A = '64b7f0c2a1b2c3d4e5f60002';
const DECK_B = '64b7f0c2a1b2c3d4e5f60003';
const NOW = new Date('2026-10-07T15:30:00.000Z');
const START = new Date('2026-10-07T00:00:00.000Z');
const END = new Date('2026-10-07T23:59:59.999Z');

let cardCounter = 0;
function card(deck: string, overrides: Record<string, unknown> = {}) {
  cardCounter += 1;
  const id = `64b7f0c2a1b2c3d4e5f7${String(cardCounter).padStart(4, '0')}`;
  return {
    _id: oid(id),
    deck: oid(deck),
    front: `Q${cardCounter}`,
    back: 'A',
    tags: [],
    easeFactor: 2.5,
    intervalDays: 0,
    repetitions: 0,
    lapses: 0,
    dueDate: START,
    lastReviewedAt: null,
    status: 'new',
    suspended: false,
    createdAt: new Date(`2026-09-${String(cardCounter).padStart(2, '0')}T09:00:00.000Z`),
    updatedAt: new Date('2026-09-30T09:00:00.000Z'),
    ...overrides,
  };
}
const dueCard = (deck: string, dueDate: string, overrides: Record<string, unknown> = {}) =>
  card(deck, { status: 'review', intervalDays: 6, repetitions: 2, dueDate: new Date(dueDate), ...overrides });

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
  cardCounter = 0;
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
});

async function get(path: string): Promise<{ status: number; json: unknown }> {
  const response = await fetch(baseUrl + path);
  return { status: response.status, json: await response.json() };
}

interface QueueScenario {
  /** Non-archived decks in scope with their daily new limit. */
  decks?: { id: string; dailyNewLimit: number }[];
  /** Cards first reviewed today, per deck. */
  usedToday?: Record<string, number>;
  /** Total `new` cards available per deck (before the allowance). */
  newAvailable?: Record<string, number>;
  /** The new cards `Card.find` returns per deck. */
  newCards?: Record<string, unknown[]>;
  dueCards?: unknown[];
  dueTotal?: number;
}

function stubQueue(scenario: QueueScenario = {}) {
  const decks = scenario.decks ?? [];
  const dueStub = queryStub(scenario.dueCards ?? []);
  const newStubs = new Map<string, QueryStub<unknown[]>>();

  vi.spyOn(Deck, 'find').mockReturnValue(
    queryStub(decks.map((deck) => ({ _id: oid(deck.id), dailyNewLimit: deck.dailyNewLimit }))) as unknown as ReturnType<
      typeof Deck.find
    >,
  );
  const cardFind = vi.spyOn(Card, 'find').mockImplementation(((filter: { status: unknown; deck: mongoose.Types.ObjectId }) => {
    if (filter.status !== 'new') return dueStub;
    const stub = queryStub(scenario.newCards?.[filter.deck.toString()] ?? []);
    newStubs.set(filter.deck.toString(), stub);
    return stub;
  }) as unknown as typeof Card.find);
  const cardCount = vi
    .spyOn(Card, 'countDocuments')
    .mockReturnValue(
      queryStub(scenario.dueTotal ?? scenario.dueCards?.length ?? 0) as unknown as ReturnType<typeof Card.countDocuments>,
    );
  const cardAggregate = vi.spyOn(Card, 'aggregate').mockResolvedValue(
    Object.entries(scenario.newAvailable ?? {}).map(([deck, count]) => ({ _id: oid(deck), count })),
  );
  const reviewAggregate = vi.spyOn(Review, 'aggregate').mockResolvedValue(
    Object.entries(scenario.usedToday ?? {}).map(([deck, count]) => ({ _id: oid(deck), count })),
  );
  return { dueStub, newStubs, cardFind, cardCount, cardAggregate, reviewAggregate };
}

describe('GET /api/study/queue', () => {
  it('returns due cards (most overdue first) and new cards within each deck allowance, with counts', async () => {
    const overdue = dueCard(DECK_A, '2026-10-01T00:00:00.000Z');
    const today = dueCard(DECK_B, '2026-10-07T00:00:00.000Z');
    const newA1 = card(DECK_A);
    const newA2 = card(DECK_A);
    const mocks = stubQueue({
      decks: [
        { id: DECK_A, dailyNewLimit: 3 },
        { id: DECK_B, dailyNewLimit: 2 },
      ],
      usedToday: { [DECK_A]: 1, [DECK_B]: 2 }, // A has 2 left; B has none left
      newAvailable: { [DECK_A]: 5 },
      newCards: { [DECK_A]: [newA1, newA2] },
      dueCards: [overdue, today],
      dueTotal: 7,
    });

    const { status, json } = await get('/api/study/queue');

    expect(status).toBe(200);
    const body = json as { due: Record<string, unknown>[]; new: Record<string, unknown>[]; counts: unknown };
    expect(body.due.map((c) => c._id)).toEqual([overdue._id.toString(), today._id.toString()]);
    expect(body.due.map((c) => c.overdueDays)).toEqual([6, 0]);
    expect(body.new.map((c) => c._id)).toEqual([newA1._id.toString(), newA2._id.toString()]);
    expect(body.new[0]).toMatchObject({ deck: DECK_A, status: 'new', overdueDays: 0 });
    // counts are totals available (7 due), not the length of the capped lists; new = min(allowance 2, available 5).
    expect(body.counts).toEqual({ due: 7, new: 2, total: 9 });

    // Due list: the shared filter, most overdue first, capped at the default limit of 20.
    expect(mocks.cardFind).toHaveBeenCalledWith({
      status: { $ne: 'new' },
      suspended: false,
      dueDate: { $lte: END },
      deck: { $in: [oid(DECK_A), oid(DECK_B)] },
    });
    expect(mocks.dueStub.sort).toHaveBeenCalledWith({ dueDate: 1, _id: 1 });
    expect(mocks.dueStub.limit).toHaveBeenCalledWith(20);
    // Deck B has no allowance left today, so its new cards are never queried.
    expect([...mocks.newStubs.keys()]).toEqual([DECK_A]);
    expect(mocks.newStubs.get(DECK_A)?.sort).toHaveBeenCalledWith({ createdAt: 1, _id: 1 });
    expect(mocks.newStubs.get(DECK_A)?.limit).toHaveBeenCalledWith(2);
  });

  it("counts today's first reviews (previousStatus new) to compute the allowance", async () => {
    const { reviewAggregate, cardAggregate } = stubQueue({
      decks: [{ id: DECK_A, dailyNewLimit: 10 }],
      newAvailable: { [DECK_A]: 4 },
    });

    await get('/api/study/queue');

    expect(reviewAggregate).toHaveBeenCalledWith([
      {
        $match: {
          deck: { $in: [oid(DECK_A)] },
          previousStatus: 'new',
          reviewedAt: { $gte: START, $lte: END },
        },
      },
      { $group: { _id: '$deck', count: { $sum: 1 } } },
    ]);
    // Only non-suspended new cards of decks that still have an allowance are counted.
    expect(cardAggregate).toHaveBeenCalledWith([
      { $match: { deck: { $in: [oid(DECK_A)] }, status: 'new', suspended: false } },
      { $group: { _id: '$deck', count: { $sum: 1 } } },
    ]);
  });

  it('never goes below zero when more new cards were reviewed than the limit allows', async () => {
    const { newStubs } = stubQueue({
      decks: [{ id: DECK_A, dailyNewLimit: 5 }],
      usedToday: { [DECK_A]: 9 },
      newAvailable: { [DECK_A]: 3 },
    });
    const { json } = await get('/api/study/queue');
    expect((json as { counts: unknown }).counts).toEqual({ due: 0, new: 0, total: 0 });
    expect(newStubs.size).toBe(0);
  });

  it('caps the new cards by the available cards when the allowance is larger', async () => {
    stubQueue({
      decks: [{ id: DECK_A, dailyNewLimit: 50 }],
      newAvailable: { [DECK_A]: 2 },
      newCards: { [DECK_A]: [card(DECK_A), card(DECK_A)] },
    });
    const { json } = await get('/api/study/queue');
    const body = json as { new: unknown[]; counts: { new: number } };
    expect(body.new).toHaveLength(2);
    expect(body.counts.new).toBe(2);
  });

  it('merges new cards across decks oldest first and caps each list at limit', async () => {
    const a1 = card(DECK_A); // created 01
    const b1 = card(DECK_B); // 02
    const a2 = card(DECK_A); // 03
    const b2 = card(DECK_B); // 04
    const dueList = [
      dueCard(DECK_A, '2026-10-01T00:00:00.000Z'),
      dueCard(DECK_A, '2026-10-02T00:00:00.000Z'),
      dueCard(DECK_B, '2026-10-03T00:00:00.000Z'),
    ];
    const { dueStub, newStubs } = stubQueue({
      decks: [
        { id: DECK_A, dailyNewLimit: 5 },
        { id: DECK_B, dailyNewLimit: 5 },
      ],
      newAvailable: { [DECK_A]: 2, [DECK_B]: 2 },
      newCards: { [DECK_A]: [a1, a2], [DECK_B]: [b1, b2] },
      dueCards: dueList.slice(0, 2),
      dueTotal: 3,
    });

    const { json } = await get('/api/study/queue?limit=3');

    const body = json as { due: unknown[]; new: { _id: string }[]; counts: unknown };
    expect(body.new.map((c) => c._id)).toEqual([a1._id, b1._id, a2._id].map(String));
    expect(body.due).toHaveLength(2);
    expect(body.counts).toEqual({ due: 3, new: 4, total: 7 });
    expect(dueStub.limit).toHaveBeenCalledWith(3);
    expect(newStubs.get(DECK_A)?.limit).toHaveBeenCalledWith(2);
  });

  it('restricts the queue to one deck when ?deck= is given', async () => {
    const findById = vi
      .spyOn(Deck, 'findById')
      .mockReturnValue(
        queryStub({ _id: oid(DECK_A), archived: false, dailyNewLimit: 4 }) as unknown as ReturnType<typeof Deck.findById>,
      );
    const { cardFind, reviewAggregate } = stubQueue({
      decks: [{ id: DECK_A, dailyNewLimit: 4 }],
      newAvailable: { [DECK_A]: 1 },
      newCards: { [DECK_A]: [card(DECK_A)] },
    });

    const { status, json } = await get(`/api/study/queue?deck=${DECK_A}`);

    expect(status).toBe(200);
    expect(findById).toHaveBeenCalledWith(DECK_A);
    expect((json as { counts: unknown }).counts).toEqual({ due: 0, new: 1, total: 1 });
    expect(cardFind).toHaveBeenCalledWith(expect.objectContaining({ deck: { $in: [oid(DECK_A)] } }));
    expect(reviewAggregate).toHaveBeenCalledOnce();
  });

  it('returns empty lists for an archived deck', async () => {
    vi.spyOn(Deck, 'findById').mockReturnValue(
      queryStub({ _id: oid(DECK_A), archived: true, dailyNewLimit: 4 }) as unknown as ReturnType<typeof Deck.findById>,
    );
    const { cardFind, reviewAggregate } = stubQueue({ decks: [] });

    const { status, json } = await get(`/api/study/queue?deck=${DECK_A}`);

    expect(status).toBe(200);
    expect(json).toEqual({ due: [], new: [], counts: { due: 0, new: 0, total: 0 } });
    expect(cardFind).toHaveBeenCalledWith(expect.objectContaining({ deck: { $in: [] } }));
    expect(reviewAggregate).not.toHaveBeenCalled();
  });

  it('returns 404 for an unknown deck and runs no card queries', async () => {
    vi.spyOn(Deck, 'findById').mockReturnValue(queryStub(null) as unknown as ReturnType<typeof Deck.findById>);
    const { cardFind } = stubQueue();
    expect(await get(`/api/study/queue?deck=${DECK_A}`)).toEqual({ status: 404, json: { message: 'Deck not found' } });
    expect(cardFind).not.toHaveBeenCalled();
  });

  it('returns 200 with empty arrays and zero counts on an empty database', async () => {
    const { reviewAggregate, cardAggregate } = stubQueue();
    expect(await get('/api/study/queue')).toEqual({
      status: 200,
      json: { due: [], new: [], counts: { due: 0, new: 0, total: 0 } },
    });
    expect(reviewAggregate).not.toHaveBeenCalled();
    expect(cardAggregate).not.toHaveBeenCalled();
  });

  it.each([
    ['deck=nope', /^Invalid ID$/],
    ['limit=0', /^limit: /],
    ['limit=101', /^limit: /],
    ['limit=abc', /^limit: /],
    ['limit=2.5', /^limit: /],
  ])('rejects %s with 400 before querying', async (query, message) => {
    const find = vi.spyOn(Card, 'find');
    const { status, json } = await get(`/api/study/queue?${query}`);
    expect(status).toBe(400);
    expect((json as { message: string }).message).toMatch(message);
    expect(find).not.toHaveBeenCalled();
  });
});
