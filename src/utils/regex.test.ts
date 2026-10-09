import { describe, expect, it } from 'vitest';
import { escapeRegex } from './regex';

describe('escapeRegex', () => {
  it('leaves plain text alone', () => {
    expect(escapeRegex('algebra 2')).toBe('algebra 2');
  });

  it('escapes every metacharacter so the result matches literally', () => {
    const input = 'a.b*c+d?e^f$g{h}i(j)k|l[m]n\\o';
    expect(new RegExp(escapeRegex(input)).test(input)).toBe(true);
    expect(new RegExp(`^${escapeRegex('.*')}$`).test('abc')).toBe(false);
  });
});
