import { describe, expect, it } from 'vitest';
import { average, percent, roundTo } from './ratio';

describe('percent', () => {
  it('returns 0 when the denominator is 0, never NaN or Infinity', () => {
    expect(percent(0, 0)).toBe(0);
    expect(percent(5, 0)).toBe(0);
  });

  it('rounds to one decimal', () => {
    expect(percent(1, 3)).toBe(33.3);
    expect(percent(2, 3)).toBe(66.7);
    expect(percent(3, 3)).toBe(100);
  });
});

describe('average', () => {
  it('returns 0 when there is nothing to average', () => {
    expect(average(0, 0, 2)).toBe(0);
    expect(average(9, 0, 1)).toBe(0);
  });

  it('rounds to the requested decimals', () => {
    expect(average(7.5, 3, 2)).toBe(2.5);
    expect(average(170, 2, 1)).toBe(85);
    expect(average(10, 3, 2)).toBe(3.33);
  });
});

describe('roundTo', () => {
  it('rounds to the requested number of decimals', () => {
    expect(roundTo(2.8000000000000003, 2)).toBe(2.8);
    expect(roundTo(12.345, 0)).toBe(12);
  });
});
