import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import mongoose from 'mongoose';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import app from '../app';
import { Card, Deck, Review, Session } from '../models';
import { queryStub } from '../test/queryStub';

// The real app against stubbed Mongoose models: these tests check the review guards, the
// scheduling written to the card and the review, and the transaction, not the database itself.

const oid = (hex: string): mongoose.Types.ObjectId => new mongoose.Types.ObjectId(hex);
const DECK_ID = '64b7f0c2a1b2c3d4e5f60002';
const OTHER_DECK_ID = '64b7f0c2a1b2c3d4e5f60003';
const CARD_ID = '64b7f0c2a1b2c3d4e5f60010';
const SESSION_ID = '64b7f0c2a1b2c3d4e5f60020';
const REVIEW_ID = '64b7f0c2a1b2c3d4e5f60030';
const NOW = new Date('2026-10-07T15:30:00.000Z');
const START = new Date('2026-10-07T00:00:00.000Z');
const END = new Date('2026-10-07T23:59:59.999Z');
const CREATED = new Date('2026-09-01T09:00:00.000Z');

function cardDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: oid(CARD_ID),
    deck: oid(DECK_ID),
    front: '2 + 2?',
    back: '4',
    tags: [],
    easeFactor: 2.5,
    intervalDays: 6,
    repetitions: 2,
    lapses: 0,
    dueDate: START,
    lastReviewedAt: new Date('2026-10-01T09:00:00.000Z'),
    status: 'review',
    suspended: false,
    createdAt: CREATED,
    updatedAt: CREATED,
    ...overrides,
  };
}
const newCard = () => cardDoc({ status: 'new', intervalDays: 0, repetitions: 0, lastReviewedAt: null });

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

async function post(path: string, body: unknown): Promise<{ status: number; json: unknown }> {
  const response = await fetch(baseUrl + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: response.status, json: await response.json() };
}
const review = (body: unknown, id = CARD_ID) => post(`/api/cards/${id}/reviews`, body);

interface World {
  card?: unknown;
  deck?: unknown;
  /** Cards first reviewed today in the deck. */
  firstReviewsToday?: number;
  session?: unknown;
}

/** Stubs the reads, the transaction and the two writes of a review. */
function stubWorld(world: World = {}) {
  const card = world.card === undefined ? cardDoc() : world.card;
  const cardById = vi.spyOn(Card, 'findById').mockReturnValue(queryStub(card) as unknown as ReturnType<typeof Card.findById>);
  vi.spyOn(Deck, 'findById').mockReturnValue(
    queryStub(
      world.deck === undefined ? { _id: oid(DECK_ID), archived: false, dailyNewLimit: 10 } : world.deck,
    ) as unknown as ReturnType<typeof Deck.findById>,
  );
  const countFirst = vi
    .spyOn(Review, 'countDocuments')
    .mockReturnValue(queryStub(world.firstReviewsToday ?? 0) as unknown as ReturnType<typeof Review.countDocuments>);
  const sessionById = vi
    .spyOn(Session, 'findById')
    .mockReturnValue(queryStub(world.session ?? null) as unknown as ReturnType<typeof Session.findById>);

  const session = {
    withTransaction: vi.fn(async (work: () => Promise<void>) => {
      await work();
    }),
    endSession: vi.fn().mockResolvedValue(undefined),
  };
  const startSession = vi.spyOn(mongoose, 'startSession').mockResolvedValue(session as never);
  const updateCard = vi.spyOn(Card, 'findOneAndUpdate').mockImplementation(((
    _filter: unknown,
    update: { $set: Record<string, unknown> },
  ) => queryStub({ ...(card as object), ...update.$set, updatedAt: NOW })) as unknown as typeof Card.findOneAndUpdate);
  const createReview = vi.spyOn(Review, 'create').mockImplementation(((docs: Record<string, unknown>[]) =>
    Promise.resolve(docs.map((doc) => ({ _id: oid(REVIEW_ID), createdAt: NOW, updatedAt: NOW, ...doc })))) as never);
  return { cardById, countFirst, sessionById, session, startSession, updateCard, createReview };
}

describe('POST /api/cards/:id/reviews: scheduling', () => {
  it('schedules an "easy" review, updates the card and saves the review, returning 201 { review, card }', async () => {
    const { updateCard, createReview, session } = stubWorld();

    const { status, json } = await review({ rating: 'easy', timeSpentMs: 4200, session: undefined });

    expect(status).toBe(201);
    // EF 2.5 -> 2.6, repetitions 2 -> 3, interval round(6 * 2.6) = 16, due start of today + 16 days.
    expect(json).toEqual({
      review: {
        _id: REVIEW_ID,
        card: CARD_ID,
        deck: DECK_ID,
        rating: 'easy',
        previousStatus: 'review',
        newStatus: 'review',
        previousInterval: 6,
        newInterval: 16,
        easeFactorAfter: 2.6,
        timeSpentMs: 4200,
        reviewedAt: NOW.toISOString(),
        createdAt: NOW.toISOString(),
        updatedAt: NOW.toISOString(),
      },
      card: expect.objectContaining({
        _id: CARD_ID,
        deck: DECK_ID,
        easeFactor: 2.6,
        intervalDays: 16,
        repetitions: 3,
        lapses: 0,
        status: 'review',
        dueDate: '2026-10-23T00:00:00.000Z',
        lastReviewedAt: NOW.toISOString(),
        overdueDays: 0,
      }) as Record<string, unknown>,
    });
    expect(updateCard).toHaveBeenCalledWith(
      // only updates the card if it is still the one the guards looked at
      { _id: oid(CARD_ID), dueDate: START, status: 'review', suspended: false },
      {
        $set: {
          easeFactor: 2.6,
          intervalDays: 16,
          repetitions: 3,
          lapses: 0,
          dueDate: new Date('2026-10-23T00:00:00.000Z'),
          status: 'review',
          lastReviewedAt: NOW,
        },
      },
      { returnDocument: 'after', runValidators: true, session },
    );
    expect(createReview).toHaveBeenCalledWith([expect.objectContaining({ rating: 'easy', reviewedAt: NOW })], { session });
  });

  it('"again" resets repetitions, keeps EF, counts a lapse and is due tomorrow', async () => {
    const { updateCard } = stubWorld({ card: cardDoc({ easeFactor: 2.7, intervalDays: 17, repetitions: 3, lapses: 1 }) });

    const { status, json } = await review({ rating: 'again' });

    expect(status).toBe(201);
    expect(json).toMatchObject({
      review: { rating: 'again', previousInterval: 17, newInterval: 1, newStatus: 'learning', easeFactorAfter: 2.7 },
      card: { easeFactor: 2.7, repetitions: 0, lapses: 2, intervalDays: 1, status: 'learning', dueDate: '2026-10-08T00:00:00.000Z' },
    });
    expect(updateCard).toHaveBeenCalledOnce();
  });

  it('reviews a new card: previousStatus new, becomes learning', async () => {
    stubWorld({ card: newCard() });
    const { json } = await review({ rating: 'good' });
    expect(json).toMatchObject({
      review: { previousStatus: 'new', newStatus: 'learning', previousInterval: 0, newInterval: 1, easeFactorAfter: 2.5 },
      card: { status: 'learning', repetitions: 1, dueDate: '2026-10-08T00:00:00.000Z' },
    });
  });

  it('records the session and omits timeSpentMs when they are not given or given', async () => {
    const { createReview } = stubWorld({ session: { _id: oid(SESSION_ID), deck: oid(DECK_ID), status: 'active' } });

    const withSession = await review({ rating: 'good', session: SESSION_ID });
    expect(withSession.status).toBe(201);
    expect((withSession.json as { review: Record<string, unknown> }).review).toMatchObject({ session: SESSION_ID });
    expect((withSession.json as { review: Record<string, unknown> }).review).not.toHaveProperty('timeSpentMs');

    const without = await review({ rating: 'good' });
    expect((without.json as { review: Record<string, unknown> }).review).not.toHaveProperty('session');
    const secondCall = createReview.mock.calls[1] as unknown as [Record<string, unknown>[]];
    expect(secondCall[0][0]).not.toHaveProperty('session');
  });

  it('runs both writes in one transaction and always ends the session', async () => {
    const { session, startSession } = stubWorld();
    await review({ rating: 'good' });
    expect(startSession).toHaveBeenCalledOnce();
    expect(session.withTransaction).toHaveBeenCalledOnce();
    expect(session.endSession).toHaveBeenCalledOnce();
  });

  it('returns 409 and saves no review when the card changed since the guards looked at it', async () => {
    const { updateCard, createReview, session } = stubWorld();
    updateCard.mockReturnValue(queryStub(null) as unknown as ReturnType<typeof Card.findOneAndUpdate>);

    expect(await review({ rating: 'good' })).toEqual({
      status: 409,
      json: { message: 'Card was changed by another request, please try again' },
    });
    expect(createReview).not.toHaveBeenCalled();
    expect(session.endSession).toHaveBeenCalledOnce();
  });

  it('a failure while saving the review aborts with 500 and still ends the session', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { createReview, session } = stubWorld();
    createReview.mockRejectedValue(new Error('connection lost'));
    expect(await review({ rating: 'good' })).toEqual({ status: 500, json: { message: 'Internal server error' } });
    expect(session.endSession).toHaveBeenCalledOnce();
  });
});

describe('POST /api/cards/:id/reviews: guards', () => {
  /** A guard failure must write nothing: no transaction, no card update, no review. */
  async function expectRejected(world: World, body: unknown, status: number, message: string) {
    const stubs = stubWorld(world);
    expect(await review(body)).toEqual({ status, json: { message } });
    expect(stubs.startSession).not.toHaveBeenCalled();
    expect(stubs.updateCard).not.toHaveBeenCalled();
    expect(stubs.createReview).not.toHaveBeenCalled();
    return stubs;
  }

  it('returns 404 for an unknown card', async () => {
    await expectRejected({ card: null }, { rating: 'good' }, 404, 'Card not found');
  });

  it('rejects a suspended card', async () => {
    await expectRejected({ card: cardDoc({ suspended: true }) }, { rating: 'good' }, 400, 'Card is suspended');
  });

  it('rejects a card that is not due yet (due after the end of today), e.g. one rated again earlier today', async () => {
    const tomorrow = new Date('2026-10-08T00:00:00.000Z');
    await expectRejected({ card: cardDoc({ dueDate: tomorrow }) }, { rating: 'good' }, 400, 'Card is not due yet');
  });

  it('accepts a card due at the very last millisecond of today and any overdue card', async () => {
    stubWorld({ card: cardDoc({ dueDate: END }) });
    expect((await review({ rating: 'good' })).status).toBe(201);
    stubWorld({ card: cardDoc({ dueDate: new Date('2026-09-01T00:00:00.000Z') }) });
    expect((await review({ rating: 'good' })).status).toBe(201);
  });

  it('rejects a card of an archived deck', async () => {
    await expectRejected(
      { deck: { _id: oid(DECK_ID), archived: true, dailyNewLimit: 10 } },
      { rating: 'good' },
      400,
      'Deck is archived',
    );
  });

  it('returns 404 when the card’s deck no longer exists', async () => {
    await expectRejected({ deck: null }, { rating: 'good' }, 404, 'Deck not found');
  });

  it('rejects a new card once the daily new limit is used, counting only first reviews of today', async () => {
    const { countFirst } = await expectRejected(
      { card: newCard(), deck: { _id: oid(DECK_ID), archived: false, dailyNewLimit: 5 }, firstReviewsToday: 5 },
      { rating: 'good' },
      400,
      'Daily new card limit reached for this deck',
    );
    expect(countFirst).toHaveBeenCalledWith({
      deck: oid(DECK_ID),
      previousStatus: 'new',
      reviewedAt: { $gte: START, $lte: END },
    });
  });

  it('accepts a new card while the limit is not yet used', async () => {
    stubWorld({ card: newCard(), deck: { _id: oid(DECK_ID), archived: false, dailyNewLimit: 5 }, firstReviewsToday: 4 });
    expect((await review({ rating: 'good' })).status).toBe(201);
  });

  it('does not apply the new-card limit to cards that were already learned', async () => {
    const { countFirst } = stubWorld({
      deck: { _id: oid(DECK_ID), archived: false, dailyNewLimit: 1 },
      firstReviewsToday: 99,
    });
    expect((await review({ rating: 'good' })).status).toBe(201);
    expect(countFirst).not.toHaveBeenCalled();
  });

  it('rejects a completed session, a session of another deck, and returns 404 for an unknown session', async () => {
    await expectRejected(
      { session: { _id: oid(SESSION_ID), deck: oid(DECK_ID), status: 'completed' } },
      { rating: 'good', session: SESSION_ID },
      400,
      'Session is already completed',
    );
    await expectRejected(
      { session: { _id: oid(SESSION_ID), deck: oid(OTHER_DECK_ID), status: 'active' } },
      { rating: 'good', session: SESSION_ID },
      400,
      'Session belongs to a different deck',
    );
    await expectRejected({ session: null }, { rating: 'good', session: SESSION_ID }, 404, 'Session not found');
  });

  it('reports the guards in the documented order: suspended, then not due, then archived', async () => {
    await expectRejected(
      { card: cardDoc({ suspended: true, dueDate: new Date('2026-10-20T00:00:00.000Z') }) },
      { rating: 'good' },
      400,
      'Card is suspended',
    );
    await expectRejected(
      {
        card: cardDoc({ dueDate: new Date('2026-10-20T00:00:00.000Z') }),
        deck: { _id: oid(DECK_ID), archived: true, dailyNewLimit: 10 },
      },
      { rating: 'good' },
      400,
      'Card is not due yet',
    );
  });
});

describe('POST /api/cards/:id/reviews: validation', () => {
  it.each([
    ['a missing rating', {}, /^rating: /],
    ['an unknown rating', { rating: 'perfect' }, /^rating: /],
    ['a numeric rating', { rating: 4 }, /^rating: /],
    ['a negative timeSpentMs', { rating: 'good', timeSpentMs: -1 }, /^timeSpentMs: /],
    ['a non-numeric timeSpentMs', { rating: 'good', timeSpentMs: 'fast' }, /^timeSpentMs: /],
    ['a malformed session id', { rating: 'good', session: 'nope' }, /^Invalid ID$/],
    ['a scheduling field', { rating: 'good', dueDate: '2026-12-01' }, /^Unknown field: dueDate$/],
    ['an injected status', { rating: 'good', status: 'mastered' }, /^Unknown field: status$/],
  ])('rejects %s with 400 before any database call', async (_label, body, message) => {
    const findById = vi.spyOn(Card, 'findById');
    const { status, json } = await review(body);
    expect(status).toBe(400);
    expect((json as { message: string }).message).toMatch(message);
    expect(findById).not.toHaveBeenCalled();
  });

  it('returns 400 "Invalid ID" for a malformed card id', async () => {
    expect(await review({ rating: 'good' }, 'xyz')).toEqual({ status: 400, json: { message: 'Invalid ID' } });
  });

  it('accepts a fractional timeSpentMs and zero', async () => {
    stubWorld();
    expect((await review({ rating: 'good', timeSpentMs: 1234.5 })).status).toBe(201);
    stubWorld();
    expect((await review({ rating: 'good', timeSpentMs: 0 })).status).toBe(201);
  });
});
