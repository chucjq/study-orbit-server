import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import type { Response } from 'express';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { ErrorResponse } from '../types/api';
import { idParamsSchema } from '../utils/objectId';
import { errorHandler } from './errorHandler';
import { notFound } from './notFound';
import { getValidated, validate } from './validate';

const rules = {
  params: idParamsSchema,
  query: z.object({ page: z.coerce.number().int().min(1).default(1) }),
  body: z.strictObject({ title: z.string().min(1) }),
};

interface EchoBody {
  id: string;
  page: number;
  title: string;
  titleIsString: boolean;
}

function buildApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.post('/items/:id', validate(rules), (_req, res: Response<EchoBody>) => {
    const { params, query, body } = getValidated(res, rules);
    // Compile-time check: these are typed by the schemas, not `any`.
    const title: string = body.title;
    const page: number = query.page;
    res.json({ id: params.id, page, title, titleIsString: typeof title === 'string' });
  });
  app.get('/unvalidated', (_req, res: Response) => {
    getValidated(res, rules);
    res.end();
  });
  app.get('/query-only', validate({ query: rules.query }), (_req, res) => {
    const { query } = getValidated(res, { query: rules.query });
    res.json(query);
  });
  app.use(notFound);
  app.use(errorHandler);
  return app;
}

let server: Server;
let baseUrl: string;
const ID = '64b7f0c2a1b2c3d4e5f60718';

beforeAll(async () => {
  server = buildApp().listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  server.close();
});

async function post(path: string, body: unknown): Promise<{ status: number; json: unknown }> {
  const response = await fetch(baseUrl + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: response.status, json: await response.json() };
}

describe('validate + getValidated', () => {
  it('passes parsed params, query (coerced, defaulted) and body to the handler', async () => {
    const withPage = await post(`/items/${ID}?page=3`, { title: 'Hello' });
    expect(withPage).toEqual({
      status: 200,
      json: { id: ID, page: 3, title: 'Hello', titleIsString: true },
    });
    const withoutPage = await post(`/items/${ID}`, { title: 'Hello' });
    expect((withoutPage.json as EchoBody).page).toBe(1);
  });

  it('rejects a malformed id with "Invalid ID" and no field prefix', async () => {
    expect(await post('/items/not-an-id', { title: 'x' })).toEqual({
      status: 400,
      json: { message: 'Invalid ID' } satisfies ErrorResponse,
    });
  });

  it('rejects an invalid query value and names the field', async () => {
    const { status, json } = await post(`/items/${ID}?page=abc`, { title: 'x' });
    expect(status).toBe(400);
    expect((json as ErrorResponse).message).toMatch(/^page: /);
    expect((await post(`/items/${ID}?page=0`, { title: 'x' })).status).toBe(400);
  });

  it('rejects a missing or empty body field and names the field', async () => {
    const missing = await post(`/items/${ID}`, {});
    expect(missing.status).toBe(400);
    expect((missing.json as ErrorResponse).message).toMatch(/^title: /);
    expect((await post(`/items/${ID}`, { title: '' })).status).toBe(400);
  });

  it('rejects unknown body fields when the schema is strict', async () => {
    expect(await post(`/items/${ID}`, { title: 'x', extra: true })).toEqual({
      status: 400,
      json: { message: 'Unknown field: extra' },
    });
  });

  it('only parses the sources it is given', async () => {
    const response = await fetch(`${baseUrl}/query-only?page=2`);
    expect(await response.json()).toEqual({ page: 2 });
  });

  it('treats a handler that reads data without validate as a server bug (500)', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const response = await fetch(`${baseUrl}/unvalidated`);
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ message: 'Internal server error' });
    spy.mockRestore();
  });
});
