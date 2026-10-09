import mongoose from 'mongoose';
import { afterEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { Deck } from '../models';
import { activeDeckIds, dueConditions, dueDateRange, dueFilter, overdueDays, type DateRange } from './due';

const NOW = new Date('2026-10-07T15:30:00.000Z');
const START = new Date('2026-10-07T00:00:00.000Z');
const END = new Date('2026-10-07T23:59:59.999Z');

/** Evaluates a Mongo date range the way the database would. */
function matches(date: Date, range: DateRange): boolean {
  const t = date.getTime();
  return (
    (range.$lt === undefined || t < range.$lt.getTime()) &&
    (range.$lte === undefined || t <= range.$lte.getTime()) &&
    (range.$gt === undefined || t > range.$gt.getTime()) &&
    (range.$gte === undefined || t >= range.$gte.getTime())
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('dueDateRange', () => {
  it('builds each bucket from the UTC day of `now`', () => {
    expect(dueDateRange('due', NOW)).toEqual({ $lte: END });
    expect(dueDateRange('overdue', NOW)).toEqual({ $lt: START });
    expect(dueDateRange('today', NOW)).toEqual({ $gte: START, $lte: END });
    expect(dueDateRange('upcoming', NOW)).toEqual({ $gt: END });
  });

  it('overdue and today together are exactly due, and upcoming never overlaps due', () => {
    const edges = [
      '2026-10-06T23:59:59.999Z',
      '2026-10-07T00:00:00.000Z',
      '2026-10-07T12:00:00.000Z',
      '2026-10-07T23:59:59.999Z',
      '2026-10-08T00:00:00.000Z',
      '2026-09-01T00:00:00.000Z',
    ].map((iso) => new Date(iso));
    for (const date of edges) {
      const due = matches(date, dueDateRange('due', NOW));
      const overdue = matches(date, dueDateRange('overdue', NOW));
      const today = matches(date, dueDateRange('today', NOW));
      const upcoming = matches(date, dueDateRange('upcoming', NOW));
      expect(overdue || today, date.toISOString()).toBe(due);
      expect(overdue && today, date.toISOString()).toBe(false);
      expect(upcoming && due, date.toISOString()).toBe(false);
    }
  });

  it('puts the boundary instants in the right bucket', () => {
    expect(matches(START, dueDateRange('today', NOW))).toBe(true);
    expect(matches(START, dueDateRange('overdue', NOW))).toBe(false);
    expect(matches(END, dueDateRange('today', NOW))).toBe(true);
    expect(matches(new Date('2026-10-08T00:00:00.000Z'), dueDateRange('upcoming', NOW))).toBe(true);
  });
});

describe('dueConditions', () => {
  it('excludes new and suspended cards in every bucket', () => {
    for (const bucket of ['due', 'overdue', 'today', 'upcoming'] as const) {
      const conditions = dueConditions(bucket, NOW);
      expect(conditions.status).toEqual({ $ne: 'new' });
      expect(conditions.suspended).toBe(false);
    }
  });
});

describe('activeDeckIds and dueFilter', () => {
  const idA = new mongoose.Types.ObjectId();
  const idB = new mongoose.Types.ObjectId();

  function mockDecks(ids: mongoose.Types.ObjectId[]): MockInstance<typeof Deck.find> {
    const spy = vi.spyOn(Deck, 'find');
    spy.mockReturnValue({
      select: () => ({ lean: () => Promise.resolve(ids.map((_id) => ({ _id }))) }),
    } as unknown as ReturnType<typeof Deck.find>);
    return spy;
  }

  it('looks up only non-archived decks', async () => {
    const spy = mockDecks([idA, idB]);
    expect(await activeDeckIds()).toEqual([idA, idB]);
    expect(spy).toHaveBeenCalledWith({ archived: false });
  });

  it('narrows to one deck and still requires it to be non-archived', async () => {
    const spy = mockDecks([]);
    expect(await activeDeckIds(idA)).toEqual([]);
    expect(spy).toHaveBeenCalledWith({ _id: idA, archived: false });
  });

  it('narrows to several decks with $in and still requires them to be non-archived', async () => {
    const spy = mockDecks([idA]);
    expect(await activeDeckIds([idA, idB])).toEqual([idA]);
    expect(spy).toHaveBeenCalledWith({ _id: { $in: [idA, idB] }, archived: false });
  });

  it('combines the card conditions with the active deck ids', async () => {
    mockDecks([idA]);
    expect(await dueFilter('today', NOW)).toEqual({
      status: { $ne: 'new' },
      suspended: false,
      dueDate: { $gte: START, $lte: END },
      deck: { $in: [idA] },
    });
  });

  it('matches nothing for an archived deck (empty $in)', async () => {
    mockDecks([]);
    expect((await dueFilter('due', NOW, { deck: idA })).deck).toEqual({ $in: [] });
  });
});

describe('overdueDays', () => {
  const card = (dueDate: string, extra: Partial<{ status: string; suspended: boolean }> = {}) => ({
    status: 'review',
    suspended: false,
    dueDate: new Date(dueDate),
    ...extra,
  });

  it('counts whole UTC days between the due day and today', () => {
    expect(overdueDays(card('2026-10-06T00:00:00.000Z'), false, NOW)).toBe(1);
    expect(overdueDays(card('2026-10-04T00:00:00.000Z'), false, NOW)).toBe(3);
    expect(overdueDays(card('2026-10-06T15:00:00.000Z'), false, NOW)).toBe(1);
  });

  it('is 0 when due today or in the future', () => {
    expect(overdueDays(card('2026-10-07T00:00:00.000Z'), false, NOW)).toBe(0);
    expect(overdueDays(card('2026-10-20T00:00:00.000Z'), false, NOW)).toBe(0);
  });

  it('is always 0 for new, suspended and archived-deck cards', () => {
    expect(overdueDays(card('2026-09-01T00:00:00.000Z', { status: 'new' }), false, NOW)).toBe(0);
    expect(overdueDays(card('2026-09-01T00:00:00.000Z', { suspended: true }), false, NOW)).toBe(0);
    expect(overdueDays(card('2026-09-01T00:00:00.000Z'), true, NOW)).toBe(0);
  });

  it('agrees with the overdue bucket on the day boundary', () => {
    const justBefore = card('2026-10-06T23:59:59.999Z');
    expect(matches(justBefore.dueDate, dueDateRange('overdue', NOW))).toBe(true);
    expect(overdueDays(justBefore, false, NOW)).toBe(1);
  });
});
