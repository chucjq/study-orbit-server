import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import mongoose from 'mongoose';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import app from '../app';
import { Review } from '../models';
import { queryStub } from '../test/queryStub';

// The real app against a stubbed Review model: these tests check the history endpoints'
// contract and the queries they build, not the database itself.

const oid = (hex: string): mongoose.Types.ObjectId => new mongoose.Types.ObjectId(hex);
const DECK_ID = '64b7f0c2a1b2c3d4e5f60002';
const CARD_ID = '64b7f0c2a1b2c3d4e5f60010';
const SESSION_ID = '64b7f0c2a1b2c3d4e5f60020';
const REVIEW_ID = '64b7f0c2a1b2c3d4e5f60030';
const REVIEWED = new Date('2026-10-05T09:00:00.000Z');

function reviewDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: oid(REVIEW_ID),
    card: oid(CARD_ID),
    deck: oid(DECK_ID),
    session: oid(SESSION_ID),
    rating: 'good',
    previousStatus: 'learning',
    newStatus: 'review',
    previousInterval: 1,
    newInterval: 6,
    easeFactorAfter: 2.5,
    timeSpentMs: 3100,
    reviewedAt: REVIEWED,
    createdAt: REVIEWED,
    updatedAt: REVIEWED,
    ...overrides,
  };
}
const expectedReview = {
  _id: REVIEW_ID,
  card: CARD_ID,
  deck: DECK_ID,
  session: SESSION_ID,
  rating: 'good',
  previousStatus: 'learning',
  newStatus: 'review',
  previousInterval: 1,
  newInterval: 6,
  easeFactorAfter: 2.5,
  timeSpentMs: 3100,
  reviewedAt: REVIEWED.toISOString(),
  createdAt: REVIEWED.toISOString(),
  updatedAt: REVIEWED.toISOString(),
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

async function call(method: string, path: string): Promise<{ status: number; json: unknown }> {
  const response = await fetch(baseUrl + path, { method });
  return { status: response.status, json: await response.json() };
}

function stubList(reviews: unknown[], total = reviews.length) {
  const list = queryStub(reviews);
  const find = vi.spyOn(Review, 'find').mockReturnValue(list as unknown as ReturnType<typeof Review.find>);
  const count = vi
    .spyOn(Review, 'countDocuments')
    .mockReturnValue(queryStub(total) as unknown as ReturnType<typeof Review.countDocuments>);
  return { list, find, count };
}

describe('GET /api/reviews', () => {
  it('returns the envelope, newest first by default, with the default limit of 20', async () => {
    const { list, find } = stubList([reviewDoc(), reviewDoc({ _id: oid(DECK_ID), session: null, timeSpentMs: undefined })], 57);

    const { status, json } = await call('GET', '/api/reviews');

    expect(status).toBe(200);
    const body = json as { data: Record<string, unknown>[]; total: number; page: number; limit: number };
    expect([body.total, body.page, body.limit]).toEqual([57, 1, 20]);
    expect(body.data[0]).toEqual(expectedReview);
    expect(body.data[1]).not.toHaveProperty('session');
    expect(body.data[1]).not.toHaveProperty('timeSpentMs');
    expect(find).toHaveBeenCalledWith({});
    expect(list.sort).toHaveBeenCalledWith({ reviewedAt: -1, _id: 1 });
    expect(list.skip).toHaveBeenCalledWith(0);
    expect(list.limit).toHaveBeenCalledWith(20);
  });

  it('applies the card, deck, session and rating filters with sort order and paging', async () => {
    const { list, find, count } = stubList([], 0);

    const { json } = await call(
      'GET',
      `/api/reviews?card=${CARD_ID}&deck=${DECK_ID}&session=${SESSION_ID}&rating=again&order=asc&page=2&limit=10`,
    );

    expect(json).toEqual({ data: [], total: 0, page: 2, limit: 10 });
    const filter = { card: CARD_ID, deck: DECK_ID, session: SESSION_ID, rating: 'again' };
    expect(find).toHaveBeenCalledWith(filter);
    expect(count).toHaveBeenCalledWith(filter);
    expect(list.sort).toHaveBeenCalledWith({ reviewedAt: 1, _id: 1 });
    expect(list.skip).toHaveBeenCalledWith(10);
    expect(list.limit).toHaveBeenCalledWith(10);
  });

  it('treats a date-only from/to as whole UTC days (to is inclusive)', async () => {
    const { find } = stubList([]);
    await call('GET', '/api/reviews?from=2026-10-01&to=2026-10-07');
    expect(find).toHaveBeenCalledWith({
      reviewedAt: { $gte: new Date('2026-10-01T00:00:00.000Z'), $lte: new Date('2026-10-07T23:59:59.999Z') },
    });
  });

  it('uses a datetime exactly as given, including an offset', async () => {
    const { find } = stubList([]);
    await call('GET', `/api/reviews?from=${encodeURIComponent('2026-10-01T12:00:00+02:00')}&to=2026-10-03T08:15:30Z`);
    expect(find).toHaveBeenCalledWith({
      reviewedAt: { $gte: new Date('2026-10-01T10:00:00.000Z'), $lte: new Date('2026-10-03T08:15:30.000Z') },
    });
  });

  it('accepts only from, only to, and the same day for both', async () => {
    const { find } = stubList([]);
    await call('GET', '/api/reviews?from=2026-10-01');
    expect(find).toHaveBeenLastCalledWith({ reviewedAt: { $gte: new Date('2026-10-01T00:00:00.000Z') } });
    await call('GET', '/api/reviews?to=2026-10-01');
    expect(find).toHaveBeenLastCalledWith({ reviewedAt: { $lte: new Date('2026-10-01T23:59:59.999Z') } });
    const sameDay = await call('GET', '/api/reviews?from=2026-10-01&to=2026-10-01');
    expect(sameDay.status).toBe(200);
  });

  it.each([
    ['card=nope', /^Invalid ID$/],
    ['deck=nope', /^Invalid ID$/],
    ['session=nope', /^Invalid ID$/],
    ['rating=perfect', /^rating: /],
    ['sort=rating', /^sort: /],
    ['order=up', /^order: /],
    ['from=yesterday', /^from: must be an ISO date/],
    ['to=2026-13-01', /^to: must be an ISO date/],
    ['from=2026-02-30', /^from: must be an ISO date/],
    ['from=2026-10-08&to=2026-10-07', /^from: must not be after to$/],
    ['limit=101', /^limit: /],
    ['page=0', /^page: /],
  ])('rejects %s with 400 before querying', async (query, message) => {
    const find = vi.spyOn(Review, 'find');
    const { status, json } = await call('GET', `/api/reviews?${query}`);
    expect(status).toBe(400);
    expect((json as { message: string }).message).toMatch(message);
    expect(find).not.toHaveBeenCalled();
  });
});

describe('GET /api/reviews/:id', () => {
  it('returns the review', async () => {
    vi.spyOn(Review, 'findById').mockReturnValue(queryStub(reviewDoc()) as unknown as ReturnType<typeof Review.findById>);
    expect(await call('GET', `/api/reviews/${REVIEW_ID}`)).toEqual({ status: 200, json: expectedReview });
  });

  it('returns 404 for an unknown review and 400 "Invalid ID" for a malformed id', async () => {
    const findById = vi
      .spyOn(Review, 'findById')
      .mockReturnValue(queryStub(null) as unknown as ReturnType<typeof Review.findById>);
    expect(await call('GET', `/api/reviews/${REVIEW_ID}`)).toEqual({ status: 404, json: { message: 'Review not found' } });
    findById.mockClear();
    expect(await call('GET', '/api/reviews/123')).toEqual({ status: 400, json: { message: 'Invalid ID' } });
    expect(findById).not.toHaveBeenCalled();
  });
});

describe('review history is append-only', () => {
  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('%s /api/reviews/:id does not exist (404 route not found)', async (method) => {
    const response = await call(method, `/api/reviews/${REVIEW_ID}`);
    expect(response).toEqual({ status: 404, json: { message: 'Route not found' } });
  });

  it('DELETE /api/reviews does not exist either', async () => {
    expect(await call('DELETE', '/api/reviews')).toEqual({ status: 404, json: { message: 'Route not found' } });
  });
});
