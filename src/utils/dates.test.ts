import { describe, expect, it } from 'vitest';
import { addUtcDays, endOfUtcDay, startOfUtcDay } from './dates';

const MIDDAY = new Date('2026-10-07T15:30:45.123Z');

describe('UTC day helpers', () => {
  it('startOfUtcDay returns midnight UTC of the same day', () => {
    expect(startOfUtcDay(MIDDAY).toISOString()).toBe('2026-10-07T00:00:00.000Z');
  });

  it('endOfUtcDay returns the last millisecond of the same day', () => {
    expect(endOfUtcDay(MIDDAY).toISOString()).toBe('2026-10-07T23:59:59.999Z');
  });

  it('treats midnight and the last millisecond as belonging to their own day', () => {
    expect(startOfUtcDay(new Date('2026-10-07T00:00:00.000Z')).toISOString()).toBe('2026-10-07T00:00:00.000Z');
    expect(startOfUtcDay(new Date('2026-10-07T23:59:59.999Z')).toISOString()).toBe('2026-10-07T00:00:00.000Z');
    expect(endOfUtcDay(new Date('2026-10-07T00:00:00.000Z')).toISOString()).toBe('2026-10-07T23:59:59.999Z');
  });

  it('crosses month and year boundaries', () => {
    expect(startOfUtcDay(addUtcDays(new Date('2026-12-31T10:00:00Z'), 1)).toISOString()).toBe('2027-01-01T00:00:00.000Z');
    expect(addUtcDays(new Date('2026-03-01T00:00:00Z'), -1).toISOString()).toBe('2026-02-28T00:00:00.000Z');
  });

  it('does not mutate its input', () => {
    const input = new Date(MIDDAY);
    startOfUtcDay(input);
    endOfUtcDay(input);
    addUtcDays(input, 3);
    expect(input.getTime()).toBe(MIDDAY.getTime());
  });
});
