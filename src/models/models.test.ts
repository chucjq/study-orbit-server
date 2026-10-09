import mongoose from 'mongoose';
import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import type { CardStatus, Rating, SessionStatus } from '../types/domain';
import { Card, Deck, Review, Session, Subject } from './index';
import type { CardFields, DeckFields, ReviewFields, SessionFields, SubjectFields } from './index';

const id = (): mongoose.Types.ObjectId => new mongoose.Types.ObjectId();

/** Runs a document's validators (no database needed) and returns the invalid paths. */
async function invalidPaths(doc: mongoose.Document): Promise<string[]> {
  try {
    await doc.validate();
    return [];
  } catch (error: unknown) {
    if (error instanceof mongoose.Error.ValidationError) return Object.keys(error.errors).sort();
    throw error;
  }
}

const collation = { locale: 'en', strength: 2 };

afterEach(() => {
  vi.useRealTimers();
});

describe('Subject', () => {
  it('accepts a minimal subject and applies defaults', async () => {
    const subject = new Subject({ name: '  Math ' });
    expect(await invalidPaths(subject)).toEqual([]);
    expect(subject.name).toBe('Math');
    expect(subject.color).toBe('#6366f1');
  });

  it.each([
    ['missing name', {}, ['name']],
    ['name too short', { name: 'a' }, ['name']],
    ['name too long', { name: 'x'.repeat(41) }, ['name']],
    ['whitespace-only name', { name: '   ' }, ['name']],
    ['invalid color', { name: 'Math', color: 'red' }, ['color']],
    ['icon longer than 4 characters', { name: 'Math', icon: 'abcde' }, ['icon']],
  ])('rejects %s', async (_label, input, expected) => {
    expect(await invalidPaths(new Subject(input))).toEqual(expected);
  });

  it('has a unique, case-insensitive index on name', () => {
    expect(Subject.schema.indexes()).toContainEqual([{ name: 1 }, expect.objectContaining({ unique: true, collation })]);
  });

  it('enables timestamps', () => {
    expect(Subject.schema.get('timestamps')).toBe(true);
  });
});

describe('Deck', () => {
  it('accepts a minimal deck and applies defaults', async () => {
    const deck = new Deck({ title: 'Algebra', subject: id() });
    expect(await invalidPaths(deck)).toEqual([]);
    expect(deck.dailyNewLimit).toBe(10);
    expect(deck.archived).toBe(false);
    expect(deck.color).toBe('#0ea5e9');
  });

  it.each([
    ['missing title', { subject: id() }, ['title']],
    ['title too short', { title: 'ab', subject: id() }, ['title']],
    ['title too long', { title: 'x'.repeat(61), subject: id() }, ['title']],
    ['missing subject', { title: 'Algebra' }, ['subject']],
    ['description too long', { title: 'Algebra', subject: id(), description: 'x'.repeat(301) }, ['description']],
    ['dailyNewLimit 0', { title: 'Algebra', subject: id(), dailyNewLimit: 0 }, ['dailyNewLimit']],
    ['dailyNewLimit 101', { title: 'Algebra', subject: id(), dailyNewLimit: 101 }, ['dailyNewLimit']],
    ['fractional dailyNewLimit', { title: 'Algebra', subject: id(), dailyNewLimit: 2.5 }, ['dailyNewLimit']],
  ])('rejects %s', async (_label, input, expected) => {
    expect(await invalidPaths(new Deck(input))).toEqual(expected);
  });

  it('has a case-insensitive unique index on subject + title', () => {
    expect(Deck.schema.indexes()).toContainEqual([
      { subject: 1, title: 1 },
      expect.objectContaining({ unique: true, collation }),
    ]);
  });
});

describe('Card', () => {
  it('applies the scheduling defaults', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-07T15:30:00Z'));
    const card = new Card({ deck: id(), front: 'Q', back: 'A' });
    expect(await invalidPaths(card)).toEqual([]);
    expect(card).toMatchObject({
      easeFactor: 2.5,
      intervalDays: 0,
      repetitions: 0,
      lapses: 0,
      status: 'new',
      suspended: false,
      lastReviewedAt: null,
    });
    expect(card.tags).toHaveLength(0);
    expect(card.dueDate.toISOString()).toBe('2026-10-07T00:00:00.000Z');
  });

  const base = { deck: id(), front: 'Q', back: 'A' };
  it.each([
    ['missing front', { ...base, front: undefined }, ['front']],
    ['front too long', { ...base, front: 'x'.repeat(501) }, ['front']],
    ['missing back', { ...base, back: undefined }, ['back']],
    ['back too long', { ...base, back: 'x'.repeat(1001) }, ['back']],
    ['missing deck', { ...base, deck: undefined }, ['deck']],
    ['more than 10 tags', { ...base, tags: Array.from({ length: 11 }, (_, i) => `t${i}`) }, ['tags']],
    ['easeFactor below 1.3', { ...base, easeFactor: 1.2 }, ['easeFactor']],
    ['negative intervalDays', { ...base, intervalDays: -1 }, ['intervalDays']],
    ['fractional repetitions', { ...base, repetitions: 1.5 }, ['repetitions']],
    ['negative lapses', { ...base, lapses: -1 }, ['lapses']],
    ['unknown status', { ...base, status: 'forgotten' }, ['status']],
  ])('rejects %s', async (_label, input, expected) => {
    expect(await invalidPaths(new Card(input))).toEqual(expected);
  });

  it('accepts exactly 10 tags', async () => {
    const tags = Array.from({ length: 10 }, (_, i) => `t${i}`);
    expect(await invalidPaths(new Card({ ...base, tags }))).toEqual([]);
  });
});

describe('Review', () => {
  const valid = {
    card: id(),
    deck: id(),
    rating: 'good',
    previousStatus: 'learning',
    newStatus: 'review',
    previousInterval: 1,
    newInterval: 6,
    easeFactorAfter: 2.5,
  };

  it('accepts a complete review; session and timeSpentMs are optional', async () => {
    const review = new Review(valid);
    expect(await invalidPaths(review)).toEqual([]);
    expect(review.reviewedAt).toBeInstanceOf(Date);
  });

  it.each([
    ['missing card', { ...valid, card: undefined }, ['card']],
    ['missing deck', { ...valid, deck: undefined }, ['deck']],
    ['missing rating', { ...valid, rating: undefined }, ['rating']],
    ['unknown rating', { ...valid, rating: 'perfect' }, ['rating']],
    ['negative timeSpentMs', { ...valid, timeSpentMs: -5 }, ['timeSpentMs']],
    ['unknown newStatus', { ...valid, newStatus: 'done' }, ['newStatus']],
  ])('rejects %s', async (_label, input, expected) => {
    expect(await invalidPaths(new Review(input))).toEqual(expected);
  });
});

describe('Session', () => {
  it('applies defaults', async () => {
    const session = new Session({ deck: id() });
    expect(await invalidPaths(session)).toEqual([]);
    expect(session).toMatchObject({
      status: 'active',
      endedAt: null,
      cardsReviewed: 0,
      correctCount: 0,
      accuracy: 0,
      totalTimeMs: 0,
    });
    expect(session.startedAt).toBeInstanceOf(Date);
  });

  it.each([
    ['missing deck', {}, ['deck']],
    ['unknown status', { deck: id(), status: 'paused' }, ['status']],
    ['accuracy above 100', { deck: id(), accuracy: 100.5 }, ['accuracy']],
    ['negative accuracy', { deck: id(), accuracy: -1 }, ['accuracy']],
    ['negative cardsReviewed', { deck: id(), cardsReviewed: -1 }, ['cardsReviewed']],
    ['negative totalTimeMs', { deck: id(), totalTimeMs: -1 }, ['totalTimeMs']],
  ])('rejects %s', async (_label, input, expected) => {
    expect(await invalidPaths(new Session(input))).toEqual(expected);
  });
});

describe('types derived from the schemas', () => {
  it('are not any and reuse the shared domain unions', () => {
    expectTypeOf<SubjectFields['name']>().toEqualTypeOf<string>();
    expectTypeOf<DeckFields['dailyNewLimit']>().toEqualTypeOf<number>();
    expectTypeOf<CardFields['easeFactor']>().toEqualTypeOf<number>();
    expectTypeOf<CardFields['status']>().toEqualTypeOf<CardStatus>();
    expectTypeOf<ReviewFields['rating']>().toEqualTypeOf<Rating>();
    expectTypeOf<SessionFields['status']>().toEqualTypeOf<SessionStatus>();
  });
});
