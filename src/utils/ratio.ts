/** Rounds `value` to `decimals` decimal places. */
export function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/** `part` as a percentage of `whole`, one decimal. 0 when `whole` is 0, so a ratio is never NaN or Infinity. */
export function percent(part: number, whole: number): number {
  return whole === 0 ? 0 : roundTo((part / whole) * 100, 1);
}

/** `total / count` rounded to `decimals`. 0 when there is nothing to average. */
export function average(total: number, count: number, decimals: number): number {
  return count === 0 ? 0 : roundTo(total / count, decimals);
}
