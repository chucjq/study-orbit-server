import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import mongoose from 'mongoose';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import app from '../app';
import { Deck, Review, Session } from '../models';
import { queryStub } from '../test/queryStub';

// The real app against stubbed Mongoose models: these tests check the sessions contract and
// the summary snapshot, not the database itself.

const oid = (hex: string): mongoose.Types.ObjectId => new mongoose.Types.ObjectId(hex);
const DECK_ID = '64b7f0c2a1b2c3d4e5f60002';
const SESSION_ID = '64b7f0c2a1b2c3d4e5f60020';
const NOW = new Date('2026-10-07T15:30:00.000Z');
const STARTED = new Date('2026-10-07T14:00:00.000Z');

function sessionDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: oid(SESSION_ID),
    deck: oid(DECK_ID),
    status: 'active',
    startedAt: STARTED,
    endedAt: null,
    cardsReviewed: 0,
    correctCount: 0,
    accuracy: 0,
    totalTimeMs: 0,
    createdAt: STARTED,
    updatedAt: STARTED,
    ...overrides,
  };
}
const expectedActive = {
  _id: SESSION_ID,
  deck: DECK_ID,
  status: 'active',
  startedAt: STARTED.toISOString(),
  endedAt: null,
  cardsReviewed: 0,
  correctCount: 0,
  accuracy: 0,
  totalTimeMs: 0,
  createdAt: STARTED.toISOString(),
  updatedAt: STARTED.toISOString(),
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
const stubDeck = (result: unknown) =>
  vi.spyOn(Deck, 'findById').mockReturnValue(queryStub(result) as unknown as ReturnType<typeof Deck.findById>);
const stubSessionById = (result: unknown) =>
  vi.spyOn(Session, 'findById').mockReturnValue(queryStub(result) as unknown as ReturnType<typeof Session.findById>);

describe('POST /api/sessions', () => {
  it('starts an active session with zeroed counters and returns 201', async () => {
    stubDeck({ _id: oid(DECK_ID), archived: false });
    const create = vi.spyOn(Session, 'create').mockResolvedValue(sessionDoc() as never);

    expect(await call('POST', '/api/sessions', { deck: DECK_ID })).toEqual({ status: 201, json: expectedActive });
    expect(create).toHaveBeenCalledWith({ deck: oid(DECK_ID) });
  });

  it('allows several active sessions for one deck (it never looks for an existing one)', async () => {
    stubDeck({ _id: oid(DECK_ID), archived: false });
    const create = vi.spyOn(Session, 'create').mockResolvedValue(sessionDoc() as never);
    const find = vi.spyOn(Session, 'find');
    expect((await call('POST', '/api/sessions', { deck: DECK_ID })).status).toBe(201);
    expect((await call('POST', '/api/sessions', { deck: DECK_ID })).status).toBe(201);
    expect(create).toHaveBeenCalledTimes(2);
    expect(find).not.toHaveBeenCalled();
  });

  it('returns 404 for an unknown deck and 400 for an archived deck, creating nothing', async () => {
    const create = vi.spyOn(Session, 'create');
    stubDeck(null);
    expect(await call('POST', '/api/sessions', { deck: DECK_ID })).toEqual({ status: 404, json: { message: 'Deck not found' } });
    stubDeck({ _id: oid(DECK_ID), archived: true });
    expect(await call('POST', '/api/sessions', { deck: DECK_ID })).toEqual({ status: 400, json: { message: 'Deck is archived' } });
    expect(create).not.toHaveBeenCalled();
  });

  it.each([
    ['a missing deck', {}, /^deck: /],
    ['a malformed deck id', { deck: 'nope' }, /^Invalid ID$/],
    ['a status in the body', { deck: DECK_ID, status: 'completed' }, /^Unknown field: status$/],
    ['summary counters in the body', { deck: DECK_ID, accuracy: 100 }, /^Unknown field: accuracy$/],
  ])('rejects %s with 400 before any database call', async (_label, body, message) => {
    const deckById = vi.spyOn(Deck, 'findById');
    const { status, json } = await call('POST', '/api/sessions', body);
    expect(status).toBe(400);
    expect((json as { message: string }).message).toMatch(message);
    expect(deckById).not.toHaveBeenCalled();
  });
});

describe('GET /api/sessions', () => {
  function stubList(sessions: unknown[], total = sessions.length) {
    const list = queryStub(sessions);
    const find = vi.spyOn(Session, 'find').mockReturnValue(list as unknown as ReturnType<typeof Session.find>);
    const count = vi
      .spyOn(Session, 'countDocuments')
      .mockReturnValue(queryStub(total) as unknown as ReturnType<typeof Session.countDocuments>);
    return { list, find, count };
  }

  it('returns the envelope, newest first, default limit 20', async () => {
    const { list, find } = stubList([sessionDoc()], 3);
    const { status, json } = await call('GET', '/api/sessions');
    expect(status).toBe(200);
    expect(json).toEqual({ data: [expectedActive], total: 3, page: 1, limit: 20 });
    expect(find).toHaveBeenCalledWith({});
    expect(list.sort).toHaveBeenCalledWith({ startedAt: -1, _id: -1 });
    expect(list.limit).toHaveBeenCalledWith(20);
  });

  it('filters by deck and status so a client can resume an active session', async () => {
    const { find, count } = stubList([]);
    await call('GET', `/api/sessions?status=active&deck=${DECK_ID}&page=2&limit=5`);
    expect(find).toHaveBeenCalledWith({ deck: DECK_ID, status: 'active' });
    expect(count).toHaveBeenCalledWith({ deck: DECK_ID, status: 'active' });
  });

  it.each([
    ['status=paused', /^status: /],
    ['deck=nope', /^Invalid ID$/],
    ['limit=101', /^limit: /],
    ['page=0', /^page: /],
  ])('rejects %s with 400 before querying', async (query, message) => {
    const find = vi.spyOn(Session, 'find');
    const { status, json } = await call('GET', `/api/sessions?${query}`);
    expect(status).toBe(400);
    expect((json as { message: string }).message).toMatch(message);
    expect(find).not.toHaveBeenCalled();
  });
});

describe('GET /api/sessions/:id', () => {
  it('returns the session', async () => {
    stubSessionById(sessionDoc());
    expect(await call('GET', `/api/sessions/${SESSION_ID}`)).toEqual({ status: 200, json: expectedActive });
  });

  it('returns 404 for an unknown session and 400 "Invalid ID" for a malformed id', async () => {
    const findById = stubSessionById(null);
    expect(await call('GET', `/api/sessions/${SESSION_ID}`)).toEqual({ status: 404, json: { message: 'Session not found' } });
    findById.mockClear();
    expect(await call('GET', '/api/sessions/123')).toEqual({ status: 400, json: { message: 'Invalid ID' } });
    expect(findById).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/sessions/:id (finish)', () => {
  /** Stubs the totals of the session's reviews and echoes the update as the saved session. */
  function stubFinish(totals: { cardsReviewed: number; correctCount: number; totalTimeMs: number } | undefined) {
    stubSessionById(sessionDoc());
    const aggregate = vi
      .spyOn(Review, 'aggregate')
      .mockResolvedValue((totals ? [{ _id: null, ...totals }] : []));
    const update = vi.spyOn(Session, 'findOneAndUpdate').mockImplementation(((
      _filter: unknown,
      change: { $set: Record<string, unknown> },
    ) => queryStub({ ...sessionDoc(), ...change.$set, updatedAt: NOW })) as unknown as typeof Session.findOneAndUpdate);
    return { aggregate, update };
  }

  it('completes the session with a snapshot of its summary', async () => {
    const { aggregate, update } = stubFinish({ cardsReviewed: 4, correctCount: 3, totalTimeMs: 18250 });

    const { status, json } = await call('PATCH', `/api/sessions/${SESSION_ID}`, { status: 'completed' });

    expect(status).toBe(200);
    expect(json).toEqual({
      ...expectedActive,
      status: 'completed',
      endedAt: NOW.toISOString(),
      cardsReviewed: 4,
      correctCount: 3,
      accuracy: 75,
      totalTimeMs: 18250,
      updatedAt: NOW.toISOString(),
    });
    expect(aggregate).toHaveBeenCalledWith([
      { $match: { session: oid(SESSION_ID) } },
      expect.objectContaining({ $group: expect.objectContaining({ _id: null }) as Record<string, unknown> }) as Record<string, unknown>,
    ]);
    // Only an active session can be finished, so a concurrent finish matches nothing.
    expect(update).toHaveBeenCalledWith(
      { _id: oid(SESSION_ID), status: 'active' },
      {
        $set: {
          status: 'completed',
          endedAt: NOW,
          cardsReviewed: 4,
          correctCount: 3,
          accuracy: 75,
          totalTimeMs: 18250,
        },
      },
      { returnDocument: 'after', runValidators: true },
    );
  });

  it('rounds accuracy to one decimal', async () => {
    stubFinish({ cardsReviewed: 3, correctCount: 2, totalTimeMs: 0 });
    const { json } = await call('PATCH', `/api/sessions/${SESSION_ID}`, { status: 'completed' });
    expect(json).toMatchObject({ accuracy: 66.7, correctCount: 2, cardsReviewed: 3 });
  });

  it('finishes a session without reviews with zeros', async () => {
    stubFinish(undefined);
    const { status, json } = await call('PATCH', `/api/sessions/${SESSION_ID}`, { status: 'completed' });
    expect(status).toBe(200);
    expect(json).toMatchObject({ status: 'completed', cardsReviewed: 0, correctCount: 0, accuracy: 0, totalTimeMs: 0 });
  });

  it('returns 400 for a session that is already completed, without recomputing', async () => {
    stubSessionById(sessionDoc({ status: 'completed', endedAt: STARTED, cardsReviewed: 2 }));
    const aggregate = vi.spyOn(Review, 'aggregate');
    const update = vi.spyOn(Session, 'findOneAndUpdate');
    expect(await call('PATCH', `/api/sessions/${SESSION_ID}`, { status: 'completed' })).toEqual({
      status: 400,
      json: { message: 'Session is already completed' },
    });
    expect(aggregate).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('returns 400 when another request finished the session in the meantime', async () => {
    const { update } = stubFinish({ cardsReviewed: 1, correctCount: 1, totalTimeMs: 100 });
    update.mockReturnValue(queryStub(null) as unknown as ReturnType<typeof Session.findOneAndUpdate>);
    expect(await call('PATCH', `/api/sessions/${SESSION_ID}`, { status: 'completed' })).toEqual({
      status: 400,
      json: { message: 'Session is already completed' },
    });
  });

  it('returns 404 for an unknown session', async () => {
    stubSessionById(null);
    expect(await call('PATCH', `/api/sessions/${SESSION_ID}`, { status: 'completed' })).toEqual({
      status: 404,
      json: { message: 'Session not found' },
    });
  });

  it.each([
    ['status active', { status: 'active' }, /^status: /],
    ['a missing status', {}, /^status: /],
    ['summary counters in the body', { status: 'completed', accuracy: 100 }, /^Unknown field: accuracy$/],
  ])('rejects %s with 400 before querying', async (_label, body, message) => {
    const findById = vi.spyOn(Session, 'findById');
    const { status, json } = await call('PATCH', `/api/sessions/${SESSION_ID}`, body);
    expect(status).toBe(400);
    expect((json as { message: string }).message).toMatch(message);
    expect(findById).not.toHaveBeenCalled();
  });

  it('returns 400 "Invalid ID" for a malformed id and has no delete endpoint', async () => {
    expect(await call('PATCH', '/api/sessions/xyz', { status: 'completed' })).toEqual({ status: 400, json: { message: 'Invalid ID' } });
    expect(await call('DELETE', `/api/sessions/${SESSION_ID}`)).toEqual({ status: 404, json: { message: 'Route not found' } });
  });
});
