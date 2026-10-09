import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import app from './app';

// Registration order of the real app: logger, JSON parser, CORS, (routes), 404, error handler.
const logged: string[] = [];
let server: Server;
let baseUrl: string;

beforeAll(async () => {
  vi.spyOn(console, 'log').mockImplementation((line: unknown) => {
    logged.push(String(line));
  });
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  server.close();
  vi.restoreAllMocks();
});

describe('app middleware order', () => {
  it('answers an unknown route with the JSON 404, CORS headers and a log line', async () => {
    const response = await fetch(`${baseUrl}/api/nope`, { headers: { Origin: 'http://localhost:5173' } });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ message: 'Route not found' });
    expect(response.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
    await expect.poll(() => logged.some((line) => /^GET \/api\/nope 404 \d+ms$/.test(line))).toBe(true);
  });

  it('turns a malformed JSON body into a logged 400 (the logger runs before the parser)', async () => {
    const response = await fetch(`${baseUrl}/api/anything`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"broken": ',
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ message: 'Invalid JSON body' });
    await expect.poll(() => logged.some((line) => /^POST \/api\/anything 400 \d+ms$/.test(line))).toBe(true);
  });
});
