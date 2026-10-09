import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import mongoose from 'mongoose';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import app from '../app';
import { Deck, Subject } from '../models';
import { queryStub } from '../test/queryStub';

// These tests run the real app (routes, validation, error handler) against stubbed Mongoose
// models: they check the HTTP contract and the queries built, not the database itself.

const ID = '64b7f0c2a1b2c3d4e5f60718';
const CREATED = new Date('2026-10-01T09:00:00.000Z');

function subjectDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: new mongoose.Types.ObjectId(ID),
    name: 'Math',
    color: '#6366f1',
    icon: '🧮',
    createdAt: CREATED,
    updatedAt: CREATED,
    ...overrides,
  };
}

const expectedSubject = {
  _id: ID,
  name: 'Math',
  color: '#6366f1',
  icon: '🧮',
  deckCount: 0,
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

function stubFind(result: unknown[]) {
  const stub = queryStub(result);
  const spy = vi.spyOn(Subject, 'find').mockReturnValue(stub as unknown as ReturnType<typeof Subject.find>);
  return { stub, spy };
}
function stubSubjectCount(total: number) {
  return vi
    .spyOn(Subject, 'countDocuments')
    .mockReturnValue(queryStub(total) as unknown as ReturnType<typeof Subject.countDocuments>);
}
function stubDeckCount(total: number) {
  return vi
    .spyOn(Deck, 'countDocuments')
    .mockReturnValue(queryStub(total) as unknown as ReturnType<typeof Deck.countDocuments>);
}
function stubFindById(result: unknown) {
  return vi
    .spyOn(Subject, 'findById')
    .mockReturnValue(queryStub(result) as unknown as ReturnType<typeof Subject.findById>);
}
function duplicateKeyError(): Error {
  return new mongoose.mongo.MongoServerError({ message: 'E11000 duplicate key', code: 11000, keyValue: { name: 'Math' } });
}

describe('GET /api/subjects', () => {
  it('returns the list envelope with deckCount, using the defaults', async () => {
    const { stub: find, spy: findSpy } = stubFind([
      subjectDoc(),
      subjectDoc({ _id: new mongoose.Types.ObjectId(), name: 'Art', icon: undefined }),
    ]);
    stubSubjectCount(2);
    vi.spyOn(Deck, 'aggregate').mockResolvedValue([{ _id: new mongoose.Types.ObjectId(ID), count: 3 }]);

    const { status, json } = await call('GET', '/api/subjects');

    expect(status).toBe(200);
    const body = json as { data: Record<string, unknown>[]; total: number; page: number; limit: number };
    expect([body.total, body.page, body.limit]).toEqual([2, 1, 100]);
    expect(body.data[0]).toEqual({ ...expectedSubject, deckCount: 3 });
    expect(body.data[1]).toMatchObject({ name: 'Art', deckCount: 0 });
    expect(body.data[1]).not.toHaveProperty('icon');
    expect(findSpy).toHaveBeenCalledWith({});
    expect(find.sort).toHaveBeenCalledWith({ name: 1, _id: 1 });
    expect(find.collation).toHaveBeenCalledWith({ locale: 'en', strength: 2 });
    expect(find.skip).toHaveBeenCalledWith(0);
    expect(find.limit).toHaveBeenCalledWith(100);
  });

  it('applies search (escaped, case-insensitive), sort and pagination', async () => {
    const { stub: find, spy: findSpy } = stubFind([]);
    const count = stubSubjectCount(0);
    vi.spyOn(Deck, 'aggregate').mockResolvedValue([]);

    const { status, json } = await call('GET', '/api/subjects?search=a.b&sort=createdAt&page=3&limit=5');

    expect(status).toBe(200);
    expect(json).toEqual({ data: [], total: 0, page: 3, limit: 5 });
    const filter = { name: { $regex: 'a\\.b', $options: 'i' } };
    expect(findSpy).toHaveBeenCalledWith(filter);
    expect(count).toHaveBeenCalledWith(filter);
    expect(find.sort).toHaveBeenCalledWith({ createdAt: 1, _id: 1 });
    expect(find.skip).toHaveBeenCalledWith(10);
    expect(find.limit).toHaveBeenCalledWith(5);
  });

  it.each([
    ['sort=banana', /^sort: /],
    ['limit=101', /^limit: /],
    ['page=0', /^page: /],
    ['page=abc', /^page: /],
  ])('rejects %s with 400', async (query, message) => {
    const find = vi.spyOn(Subject, 'find');
    const { status, json } = await call('GET', `/api/subjects?${query}`);
    expect(status).toBe(400);
    expect((json as { message: string }).message).toMatch(message);
    expect(find).not.toHaveBeenCalled();
  });
});

describe('GET /api/subjects/:id', () => {
  it('returns the subject with its deckCount', async () => {
    stubFindById(subjectDoc());
    stubDeckCount(2);
    expect(await call('GET', `/api/subjects/${ID}`)).toEqual({ status: 200, json: { ...expectedSubject, deckCount: 2 } });
  });

  it('returns 404 for an unknown subject', async () => {
    stubFindById(null);
    expect(await call('GET', `/api/subjects/${ID}`)).toEqual({ status: 404, json: { message: 'Subject not found' } });
  });

  it('returns 400 "Invalid ID" for a malformed id without touching the database', async () => {
    const findById = vi.spyOn(Subject, 'findById');
    expect(await call('GET', '/api/subjects/123')).toEqual({ status: 400, json: { message: 'Invalid ID' } });
    expect(findById).not.toHaveBeenCalled();
  });
});

describe('POST /api/subjects', () => {
  it('creates a subject and returns 201 with deckCount 0', async () => {
    const create = vi.spyOn(Subject, 'create').mockResolvedValue(subjectDoc() as never);
    const { status, json } = await call('POST', '/api/subjects', { name: '  Math  ', color: '#112233' });
    expect(status).toBe(201);
    expect(json).toEqual(expectedSubject);
    expect(create).toHaveBeenCalledWith({ name: 'Math', color: '#112233' });
  });

  it.each([
    ['a missing name', {}, /^name: /],
    ['a name that is too short', { name: 'a' }, /^name: /],
    ['a name that is too long', { name: 'x'.repeat(41) }, /^name: /],
    ['an invalid color', { name: 'Math', color: 'red' }, /^color: /],
    ['an icon longer than 4 characters', { name: 'Math', icon: 'abcde' }, /^icon: /],
    ['an unknown field', { name: 'Math', deckCount: 5 }, /^Unknown field: deckCount$/],
  ])('rejects %s with 400 and does not write', async (_label, body, message) => {
    const create = vi.spyOn(Subject, 'create');
    const { status, json } = await call('POST', '/api/subjects', body);
    expect(status).toBe(400);
    expect((json as { message: string }).message).toMatch(message);
    expect(create).not.toHaveBeenCalled();
  });

  it('returns 400 naming the field for a duplicate name', async () => {
    vi.spyOn(Subject, 'create').mockRejectedValue(duplicateKeyError());
    expect(await call('POST', '/api/subjects', { name: 'math' })).toEqual({
      status: 400,
      json: { message: 'Duplicate value for: name' },
    });
  });
});

describe('PUT /api/subjects/:id', () => {
  it('replaces the editable fields: omitted color resets to the default, omitted icon is cleared', async () => {
    const doc = { ...subjectDoc({ color: '#ff0000' }), save: vi.fn().mockResolvedValue(undefined) };
    stubFindById(doc);
    stubDeckCount(1);

    const { status, json } = await call('PUT', `/api/subjects/${ID}`, { name: 'Algebra' });

    expect(status).toBe(200);
    expect(doc).toMatchObject({ name: 'Algebra', color: '#6366f1', icon: undefined });
    expect(doc.save).toHaveBeenCalledOnce();
    expect(json).toMatchObject({ _id: ID, name: 'Algebra', deckCount: 1 });
    expect(json).not.toHaveProperty('icon');
  });

  it('an empty icon string clears the icon', async () => {
    const doc = { ...subjectDoc(), save: vi.fn().mockResolvedValue(undefined) };
    stubFindById(doc);
    stubDeckCount(0);
    await call('PUT', `/api/subjects/${ID}`, { name: 'Math', icon: '' });
    expect(doc.icon).toBeUndefined();
  });

  it('returns 404 for an unknown subject', async () => {
    stubFindById(null);
    expect(await call('PUT', `/api/subjects/${ID}`, { name: 'Algebra' })).toEqual({
      status: 404,
      json: { message: 'Subject not found' },
    });
  });

  it('returns 400 for a duplicate name', async () => {
    stubFindById({ ...subjectDoc(), save: vi.fn().mockRejectedValue(duplicateKeyError()) });
    expect(await call('PUT', `/api/subjects/${ID}`, { name: 'Math' })).toEqual({
      status: 400,
      json: { message: 'Duplicate value for: name' },
    });
  });

  it('validates the id and the body before querying', async () => {
    const findById = vi.spyOn(Subject, 'findById');
    expect(await call('PUT', '/api/subjects/nope', { name: 'Algebra' })).toEqual({ status: 400, json: { message: 'Invalid ID' } });
    expect((await call('PUT', `/api/subjects/${ID}`, {})).status).toBe(400);
    expect(findById).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/subjects/:id', () => {
  it('deletes a subject without decks', async () => {
    stubFindById(subjectDoc());
    stubDeckCount(0);
    const deleteOne = vi
      .spyOn(Subject, 'deleteOne')
      .mockReturnValue(queryStub({ deletedCount: 1 }) as unknown as ReturnType<typeof Subject.deleteOne>);

    expect(await call('DELETE', `/api/subjects/${ID}`)).toEqual({ status: 200, json: { message: 'Subject deleted' } });
    expect(deleteOne).toHaveBeenCalledWith({ _id: new mongoose.Types.ObjectId(ID) });
  });

  it('refuses to delete a subject that still has decks', async () => {
    stubFindById(subjectDoc());
    stubDeckCount(2);
    const deleteOne = vi.spyOn(Subject, 'deleteOne');

    expect(await call('DELETE', `/api/subjects/${ID}`)).toEqual({
      status: 400,
      json: { message: 'Cannot delete a subject that still has decks' },
    });
    expect(deleteOne).not.toHaveBeenCalled();
  });

  it('returns 404 for an unknown subject and 400 for a malformed id', async () => {
    stubFindById(null);
    expect(await call('DELETE', `/api/subjects/${ID}`)).toEqual({ status: 404, json: { message: 'Subject not found' } });
    expect(await call('DELETE', '/api/subjects/xyz')).toEqual({ status: 400, json: { message: 'Invalid ID' } });
  });
});
