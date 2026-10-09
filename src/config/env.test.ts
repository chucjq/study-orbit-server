import { describe, expect, it } from 'vitest';
import { parseOrigins } from './env';

describe('parseOrigins', () => {
  it('returns a single origin as a one-item list', () => {
    expect(parseOrigins('http://localhost:5173')).toEqual(['http://localhost:5173']);
  });

  it('splits on commas and trims whitespace', () => {
    expect(parseOrigins(' http://localhost:5173 , https://user.github.io ')).toEqual([
      'http://localhost:5173',
      'https://user.github.io',
    ]);
  });

  it('ignores empty entries', () => {
    expect(parseOrigins('http://localhost:5173,,')).toEqual(['http://localhost:5173']);
  });
});
