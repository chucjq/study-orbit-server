import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import mongoose from 'mongoose';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import app from '../app';
import { Card, Deck, Review, Session, Subject } from '../models';
import { queryStub } from '../test/queryStub';
import { startOfUtcDay, utcDayKey } from '../utils/dates';

// The real app against stubbed models: these tests check the HTTP contract, validation and the
// shape of computed values. Aggregation pipelines against a real MongoDB are checked separately.

const oid = (hex: string): mongoose.Types.ObjectId => new mongoose.Types.ObjectId(hex);
const DECK_ID = '64b7f0c2a1b2c3d4e5f60002';
const SUBJECT_ID = '64b7f0c2a1b2c3d4e5f60001';
const OTHER_SUBJECT_ID = '64b7f0c2a1b2c3d4e5f60004';
const OTHER_DECK_ID = '64b7f0c2a1b2c3d4e5f60003';
const CARD_ID = '64b7f0c2a1b2c3d4e5f60009';
const CREATED = new Date('2026-10-01T09:00:00.000Z');

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

async function get(path: string): Promise<{ status: number; json: unknown }> {
  const response = await fetch(baseUrl + path);
  return { status: response.status, json: await response.json() };
}

/** An empty database: every count is 0, every aggregation and list is empty. */
function stubEmptyDatabase(): void {
  for (const model of [Subject, Deck, Card, Review]) {
    vi.spyOn(model, 'countDocuments').mockReturnValue(queryStub(0) as never);
  }
  vi.spyOn(Subject, 'find').mockReturnValue(queryStub([]) as never);
  vi.spyOn(Deck, 'find').mockReturnValue(queryStub([]) as never);
  vi.spyOn(Card, 'find').mockReturnValue(queryStub([]) as never);
  vi.spyOn(Card, 'aggregate').mockResolvedValue([] as never);
  vi.spyOn(Review, 'aggregate').mockResolvedValue([] as never);
  vi.spyOn(Session, 'aggregate').mockResolvedValue([] as never);
}

describe('GET /api/stats/overview', () => {
  it('returns zeros, never NaN or null, on an empty database', async () => {
    stubEmptyDatabase();

    const { status, json } = await get('/api/stats/overview');

    expect(status).toBe(200);
    expect(json).toEqual({
      totalSubjects: 0,
      totalDecks: 0,
      totalCards: 0,
      dueToday: 0,
      reviewsToday: 0,
      statusDistribution: { new: 0, learning: 0, review: 0, mastered: 0 },
      retentionRate: 0,
      averageEaseFactor: 0,
      currentStreak: 0,
      longestStreak: 0,
    });
  });

  it('computes the streak from review days and the retention from review totals', async () => {
    stubEmptyDatabase();
    const today = utcDayKey(new Date());
    const yesterday = utcDayKey(new Date(Date.now() - 24 * 60 * 60 * 1000));
    vi.spyOn(Review, 'aggregate').mockImplementation(((pipeline: Record<string, unknown>[]) => {
      const group = pipeline.find((stage) => '$group' in stage);
      const id = (group?.$group as { _id?: unknown } | undefined)?._id;
      if (typeof id === 'object' && id !== null && '$dateToString' in id) {
        return Promise.resolve([{ _id: today }, { _id: yesterday }]);
      }
      return Promise.resolve([{ _id: null, total: 10, retained: 9 }]);
    }) as never);

    const { json } = await get('/api/stats/overview');

    expect(json).toMatchObject({ currentStreak: 2, longestStreak: 2, retentionRate: 90 });
  });
});

describe('GET /api/stats/decks/:id', () => {
  it('rejects a malformed id with 400', async () => {
    stubEmptyDatabase();

    const { status, json } = await get('/api/stats/decks/not-an-id');

    expect(status).toBe(400);
    expect(json).toEqual({ message: 'Invalid ID' });
  });

  it('returns 404 for a deck that does not exist', async () => {
    stubEmptyDatabase();
    vi.spyOn(Deck, 'findById').mockReturnValue(queryStub(null) as never);

    const { status, json } = await get(`/api/stats/decks/${DECK_ID}`);

    expect(status).toBe(404);
    expect(json).toEqual({ message: 'Deck not found' });
  });

  it('returns zeros for an empty deck', async () => {
    stubEmptyDatabase();
    vi.spyOn(Deck, 'findById').mockReturnValue(queryStub({ _id: oid(DECK_ID) }) as never);

    const { status, json } = await get(`/api/stats/decks/${DECK_ID}`);

    expect(status).toBe(200);
    expect(json).toEqual({
      cardCount: 0,
      statusDistribution: { new: 0, learning: 0, review: 0, mastered: 0 },
      masteryPercent: 0,
      retentionRate: 0,
      averageEaseFactor: 0,
      dueToday: 0,
      sessionCount: 0,
      averageSessionAccuracy: 0,
    });
  });

  it('computes mastery over non-suspended cards and average completed-session accuracy', async () => {
    stubEmptyDatabase();
    vi.spyOn(Deck, 'findById').mockReturnValue(queryStub({ _id: oid(DECK_ID) }) as never);
    vi.spyOn(Card, 'aggregate').mockImplementation(((pipeline: Record<string, unknown>[]) => {
      const group = pipeline.find((stage) => '$group' in stage);
      const id = (group?.$group as { _id?: unknown } | undefined)?._id;
      if (id === '$status') {
        return Promise.resolve([
          { _id: 'new', count: 2 },
          { _id: 'mastered', count: 2 },
          { _id: 'review', count: 1 },
        ]);
      }
      return Promise.resolve([{ _id: null, cards: 5, active: 4, mastered: 2, reviewed: 3, easeTotal: 7.5 }]);
    }) as never);
    vi.spyOn(Review, 'aggregate').mockResolvedValue([{ _id: null, total: 10, retained: 9 }] as never);
    vi.spyOn(Card, 'countDocuments').mockReturnValue(queryStub(1) as never);
    vi.spyOn(Session, 'aggregate').mockResolvedValue([{ count: 2, accuracySum: 170 }] as never);

    const { json } = await get(`/api/stats/decks/${DECK_ID}`);

    expect(json).toEqual({
      cardCount: 5,
      statusDistribution: { new: 2, learning: 0, review: 1, mastered: 2 },
      masteryPercent: 50,
      retentionRate: 90,
      averageEaseFactor: 2.5,
      dueToday: 1,
      sessionCount: 2,
      averageSessionAccuracy: 85,
    });
  });
});

describe('GET /api/stats/subjects', () => {
  it('returns an empty list on an empty database', async () => {
    stubEmptyDatabase();

    const { status, json } = await get('/api/stats/subjects');

    expect(status).toBe(200);
    expect(json).toEqual([]);
  });

  it('gives a subject with no decks zeros and orders by mastery descending', async () => {
    stubEmptyDatabase();
    vi.spyOn(Subject, 'find').mockReturnValue(
      queryStub([
        { _id: oid(SUBJECT_ID), name: 'Math' },
        { _id: oid(OTHER_SUBJECT_ID), name: 'History' },
      ]) as never,
    );
    vi.spyOn(Deck, 'find').mockReturnValue(
      queryStub([
        { _id: oid(DECK_ID), subject: oid(SUBJECT_ID) },
        { _id: oid(OTHER_DECK_ID), subject: oid(SUBJECT_ID) },
      ]) as never,
    );
    vi.spyOn(Card, 'aggregate').mockResolvedValue([
      { _id: oid(DECK_ID), cards: 4, active: 4, mastered: 2, reviewed: 3, easeTotal: 7.5 },
    ] as never);
    vi.spyOn(Review, 'aggregate').mockResolvedValue([{ _id: oid(DECK_ID), total: 10, retained: 9 }] as never);

    const { json } = await get('/api/stats/subjects');

    expect(json).toEqual([
      { _id: SUBJECT_ID, name: 'Math', deckCount: 2, cardCount: 4, masteryPercent: 50, retentionRate: 90 },
      { _id: OTHER_SUBJECT_ID, name: 'History', deckCount: 0, cardCount: 0, masteryPercent: 0, retentionRate: 0 },
    ]);
  });
});

describe('GET /api/stats/activity', () => {
  it('returns one zero-filled entry per day, ending today', async () => {
    stubEmptyDatabase();
    const today = utcDayKey(new Date());
    vi.spyOn(Review, 'aggregate').mockResolvedValue([{ _id: today, reviews: 3, correct: 2 }] as never);

    const { status, json } = await get('/api/stats/activity?days=3');

    expect(status).toBe(200);
    expect(json).toHaveLength(3);
    expect(json).toEqual([
      expect.objectContaining({ reviews: 0, correct: 0 }),
      expect.objectContaining({ reviews: 0, correct: 0 }),
      { date: today, reviews: 3, correct: 2 },
    ]);
  });

  it('defaults to 30 days', async () => {
    stubEmptyDatabase();

    const { json } = await get('/api/stats/activity');

    expect(json).toHaveLength(30);
  });

  it.each(['0', '366', 'abc'])('rejects days=%s with 400', async (days) => {
    stubEmptyDatabase();

    const { status, json } = await get(`/api/stats/activity?days=${days}`);

    expect(status).toBe(400);
    expect(json).toHaveProperty('message');
  });
});

describe('GET /api/stats/forecast', () => {
  it('makes day 0 equal dueToday and zero-fills the following days', async () => {
    stubEmptyDatabase();
    vi.spyOn(Card, 'countDocuments').mockReturnValue(queryStub(4) as never);

    const { status, json } = await get('/api/stats/forecast');

    expect(status).toBe(200);
    const days = json as { date: string; count: number }[];
    expect(days).toHaveLength(14);
    expect(days[0]).toEqual({ date: utcDayKey(new Date()), count: 4 });
    expect(days.slice(1).every((day) => day.count === 0)).toBe(true);
  });

  it.each(['0', '91', 'abc'])('rejects days=%s with 400', async (days) => {
    stubEmptyDatabase();

    const { status } = await get(`/api/stats/forecast?days=${days}`);

    expect(status).toBe(400);
  });
});

describe('GET /api/stats/hardest', () => {
  it('returns lapsed cards in the card response shape', async () => {
    stubEmptyDatabase();
    const card = {
      _id: oid(CARD_ID),
      deck: oid(DECK_ID),
      front: 'Q',
      back: 'A',
      tags: [],
      easeFactor: 1.5,
      intervalDays: 1,
      repetitions: 0,
      lapses: 3,
      // Due today, so the card is not overdue whatever day the test runs.
      dueDate: startOfUtcDay(new Date()),
      lastReviewedAt: null,
      status: 'learning',
      suspended: false,
      createdAt: CREATED,
      updatedAt: CREATED,
    };
    vi.spyOn(Card, 'find').mockReturnValue(queryStub([card]) as never);
    vi.spyOn(Deck, 'find').mockReturnValue(queryStub([{ _id: oid(DECK_ID), archived: false }]) as never);

    const { status, json } = await get('/api/stats/hardest');

    expect(status).toBe(200);
    expect(json).toEqual([
      expect.objectContaining({ _id: CARD_ID, deck: DECK_ID, lapses: 3, easeFactor: 1.5, overdueDays: 0 }),
    ]);
  });

  it('rejects limit=51 with 400', async () => {
    stubEmptyDatabase();

    const { status } = await get('/api/stats/hardest?limit=51');

    expect(status).toBe(400);
  });
});
