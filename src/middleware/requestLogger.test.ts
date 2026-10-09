import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { errorHandler } from './errorHandler';
import { notFound } from './notFound';
import { createRequestLogger } from './requestLogger';

const lines: string[] = [];
let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const app = express();
  app.use(createRequestLogger((line) => lines.push(line)));
  app.get('/ok', (_req, res) => {
    res.status(201).json({ ok: true });
  });
  app.use(notFound);
  app.use(errorHandler);
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  server.close();
});

/** The line is written on `finish`, which can land just after the client has read the response. */
async function request(path: string): Promise<string> {
  const before = lines.length;
  await fetch(baseUrl + path);
  await expect.poll(() => lines.length).toBe(before + 1);
  return lines[before] ?? '';
}

describe('requestLogger', () => {
  it('logs method, path, real status and duration', async () => {
    expect(await request('/ok')).toMatch(/^GET \/ok 201 \d+ms$/);
  });

  it('logs the 404 status set by the catch-all and leaves out the query string', async () => {
    expect(await request('/nope?secret=1')).toMatch(/^GET \/nope 404 \d+ms$/);
  });
});
