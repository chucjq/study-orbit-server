import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import mongoose from 'mongoose';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { ErrorResponse } from '../types/api';
import { AppError } from '../utils/appError';
import { errorHandler } from './errorHandler';
import { notFound } from './notFound';

const Thing = mongoose.model('ErrorHandlerThing', new mongoose.Schema({ title: { type: String, required: true } }));

function buildApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.post('/echo', (req, res) => {
    res.json({ ok: true, body: req.body as unknown });
  });
  app.get('/app-error', () => {
    throw new AppError(404, 'Deck not found');
  });
  app.get('/async-app-error', async () => {
    await Promise.resolve();
    throw new AppError(400, 'Card is suspended');
  });
  app.get('/zod-type', () => {
    z.object({ title: z.string() }).parse({});
  });
  app.get('/zod-strict', () => {
    z.object({ title: z.string() }).strict().parse({ title: 'a', extra: 1 });
  });
  app.get('/mongoose-validation', async () => {
    await new Thing({}).validate();
  });
  app.get('/cast', () => {
    throw new mongoose.Error.CastError('ObjectId', 'abc', '_id');
  });
  app.get('/duplicate', () => {
    throw new mongoose.mongo.MongoServerError({ message: 'E11000 duplicate key', code: 11000, keyValue: { name: 'Math' } });
  });
  app.get('/boom', () => {
    throw new Error('secret internal detail');
  });
  app.use(notFound);
  app.use(errorHandler);
  return app;
}

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  server = buildApp().listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  server.close();
});

async function get(path: string): Promise<{ status: number; body: ErrorResponse }> {
  const response = await fetch(baseUrl + path);
  return { status: response.status, body: (await response.json()) as ErrorResponse };
}

describe('notFound and errorHandler', () => {
  it('returns 404 JSON for an unmatched route', async () => {
    expect(await get('/nope')).toEqual({ status: 404, body: { message: 'Route not found' } });
  });

  it('uses the status and message of an AppError (sync and async)', async () => {
    expect(await get('/app-error')).toEqual({ status: 404, body: { message: 'Deck not found' } });
    expect(await get('/async-app-error')).toEqual({ status: 400, body: { message: 'Card is suspended' } });
  });

  it('names the first invalid field of a Zod error', async () => {
    const { status, body } = await get('/zod-type');
    expect(status).toBe(400);
    expect(body.message).toMatch(/^title: /);
  });

  it('names the unknown field of a strict Zod schema', async () => {
    expect(await get('/zod-strict')).toEqual({ status: 400, body: { message: 'Unknown field: extra' } });
  });

  it('names the invalid field of a Mongoose ValidationError', async () => {
    const { status, body } = await get('/mongoose-validation');
    expect(status).toBe(400);
    expect(body.message).toMatch(/^title: /);
  });

  it('returns "Invalid ID" for a CastError', async () => {
    expect(await get('/cast')).toEqual({ status: 400, body: { message: 'Invalid ID' } });
  });

  it('names the duplicated field for a duplicate-key error', async () => {
    expect(await get('/duplicate')).toEqual({ status: 400, body: { message: 'Duplicate value for: name' } });
  });

  it('returns 400 for malformed JSON bodies', async () => {
    const response = await fetch(`${baseUrl}/echo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"title": ',
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ message: 'Invalid JSON body' });
  });

  it('hides unexpected errors behind a generic 500 and logs them', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const result = await get('/boom');
    expect(result).toEqual({ status: 500, body: { message: 'Internal server error' } });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
