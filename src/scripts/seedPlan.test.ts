import { describe, expect, it } from 'vitest';
import { Card, Deck, Review, Session, Subject } from '../models';
import { addUtcDays, endOfUtcDay, startOfUtcDay, utcDayKey } from '../utils/dates';
import { currentStreak } from '../utils/streak';
import { summarize } from '../utils/sessionSummary';
import { buildSeedPlan, type CardDoc, type ReviewDoc, type SeedPlan } from './seedPlan';

// The plan is checked against the same rules the API enforces, without a database: schema
// validation comes from the Mongoose models (`validateSync` needs no connection), and the replay
// is checked by re-deriving every step.

const NOW = new Date('2026-10-08T15:00:00.000Z');
const TODAY = startOfUtcDay(NOW);
const TODAY_END = endOfUtcDay(NOW);

const plan: SeedPlan = buildSeedPlan(NOW);

const deckById = new Map(plan.decks.map((deck) => [deck._id.toString(), deck]));
const archivedDeckIds = new Set(plan.decks.filter((deck) => deck.archived).map((deck) => deck._id.toString()));
const activeCards = plan.cards.filter((card) => !archivedDeckIds.has(card.deck.toString()));

function reviewsOf(card: CardDoc): ReviewDoc[] {
  return plan.reviews
    .filter((review) => review.card.equals(card._id))
    .sort((a, b) => a.reviewedAt.getTime() - b.reviewedAt.getTime());
}

describe('seed plan shape', () => {
  it('has 4 subjects, 5 decks (one archived) and about 60 cards', () => {
    expect(plan.subjects).toHaveLength(4);
    expect(plan.decks).toHaveLength(5);
    expect(archivedDeckIds.size).toBe(1);
    expect(plan.cards.length).toBeGreaterThanOrEqual(55);
    expect(plan.cards.length).toBeLessThanOrEqual(65);
  });

  it('has a few hundred reviews and about 15 or more sessions', () => {
    expect(plan.reviews.length).toBeGreaterThanOrEqual(150);
    expect(plan.reviews.length).toBeLessThanOrEqual(300);
    expect(plan.sessions.length).toBeGreaterThanOrEqual(15);
    expect(plan.sessions.length).toBeLessThanOrEqual(30);
  });

  it('is the same for every anchor date: only the timestamps move', () => {
    const later = buildSeedPlan(addUtcDays(NOW, 3));
    expect({
      cards: later.cards.length,
      reviews: later.reviews.length,
      sessions: later.sessions.length,
      ratings: later.reviews.map((review) => review.rating),
    }).toEqual({
      cards: plan.cards.length,
      reviews: plan.reviews.length,
      sessions: plan.sessions.length,
      ratings: plan.reviews.map((review) => review.rating),
    });
  });
});

describe('schema validity', () => {
  it('every document passes its Mongoose schema (validation needs no connection)', async () => {
    const checks: [string, Promise<unknown>][] = [
      ...plan.subjects.map((doc): [string, Promise<unknown>] => ['subject', new Subject(doc).validate()]),
      ...plan.decks.map((doc): [string, Promise<unknown>] => ['deck', new Deck(doc).validate()]),
      ...plan.cards.map((doc): [string, Promise<unknown>] => ['card', new Card(doc).validate()]),
      ...plan.reviews.map((doc): [string, Promise<unknown>] => ['review', new Review(doc).validate()]),
      ...plan.sessions.map((doc): [string, Promise<unknown>] => ['session', new Session(doc).validate()]),
    ];
    const results = await Promise.allSettled(checks.map(([, promise]) => promise));
    const failures = results.flatMap((result, index) => {
      const label = checks[index]?.[0] ?? 'document';
      if (result.status === 'fulfilled') return [];
      const reason: unknown = result.reason;
      return [`${label}: ${reason instanceof Error ? reason.message : 'invalid'}`];
    });
    expect(failures).toEqual([]);
  });
});

describe('replay chain', () => {
  it('each review starts from the state the previous review left', () => {
    for (const card of plan.cards) {
      const reviews = reviewsOf(card);
      reviews.forEach((review, index) => {
        const before = reviews[index - 1];
        expect(review.previousStatus).toBe(before ? before.newStatus : 'new');
        expect(review.previousInterval).toBe(before ? before.newInterval : 0);
      });
    }
  });

  it('the card row equals the state after its last review', () => {
    for (const card of plan.cards) {
      const last = reviewsOf(card).at(-1);
      if (!last) {
        expect(card.status).toBe('new');
        expect(card.lastReviewedAt).toBeNull();
        continue;
      }
      expect(card.status).toBe(last.newStatus);
      expect(card.intervalDays).toBe(last.newInterval);
      expect(card.easeFactor).toBe(last.easeFactorAfter);
      expect(card.lastReviewedAt?.getTime()).toBe(last.reviewedAt.getTime());
    }
  });

  it('every review belongs to a card of the same deck', () => {
    const cardById = new Map(plan.cards.map((card) => [card._id.toString(), card]));
    for (const review of plan.reviews) {
      const card = cardById.get(review.card.toString());
      expect(card, 'review refers to a card in the plan').toBeDefined();
      expect(review.deck.toString()).toBe(card?.deck.toString());
    }
  });
});

describe('API rules hold along the replay', () => {
  it('a card is only reviewed on or after the day it fell due', () => {
    for (const card of plan.cards) {
      const reviews = reviewsOf(card);
      reviews.slice(1).forEach((review, index) => {
        const previous = reviews[index];
        if (!previous) return;
        // The previous review set dueDate = start of its UTC day + its new interval.
        const previousDue = addUtcDays(startOfUtcDay(previous.reviewedAt), previous.newInterval);
        expect(previousDue.getTime()).toBeLessThanOrEqual(endOfUtcDay(review.reviewedAt).getTime());
      });
    }
  });

  it('never exceeds a deck\'s daily new-card limit', () => {
    const firstReviewsPerDeckDay = new Map<string, number>();
    for (const review of plan.reviews) {
      if (review.previousStatus !== 'new') continue;
      const key = `${review.deck.toString()}|${utcDayKey(review.reviewedAt)}`;
      firstReviewsPerDeckDay.set(key, (firstReviewsPerDeckDay.get(key) ?? 0) + 1);
    }
    for (const [key, count] of firstReviewsPerDeckDay) {
      const deckId = key.split('|')[0] ?? '';
      expect(count, key).toBeLessThanOrEqual(deckById.get(deckId)?.dailyNewLimit ?? 0);
    }
  });

  it('no review is dated after the anchor time', () => {
    for (const review of plan.reviews) expect(review.reviewedAt.getTime()).toBeLessThanOrEqual(NOW.getTime());
    for (const session of plan.sessions) expect(session.endedAt.getTime()).toBeLessThanOrEqual(NOW.getTime());
  });
});

describe('sessions agree with their reviews', () => {
  it('summaries match the reviews of each session', () => {
    for (const session of plan.sessions) {
      const reviews = plan.reviews
        .filter((review) => review.session.equals(session._id))
        .sort((a, b) => a.reviewedAt.getTime() - b.reviewedAt.getTime());
      expect(reviews.length, 'a completed session has reviews').toBeGreaterThan(0);

      const expected = summarize({
        cardsReviewed: reviews.length,
        correctCount: reviews.filter((review) => review.rating !== 'again').length,
        totalTimeMs: reviews.reduce((sum, review) => sum + review.timeSpentMs, 0),
      });
      expect(session.cardsReviewed).toBe(expected.cardsReviewed);
      expect(session.correctCount).toBe(expected.correctCount);
      expect(session.accuracy).toBe(expected.accuracy);
      expect(session.totalTimeMs).toBe(expected.totalTimeMs);
      expect(session.startedAt.getTime()).toBe(reviews[0]?.reviewedAt.getTime());
      expect(session.endedAt.getTime()).toBe(reviews.at(-1)?.reviewedAt.getTime());
      for (const review of reviews) expect(review.deck.equals(session.deck)).toBe(true);
    }
  });
});

describe('scenario coverage', () => {
  it('has cards due today, overdue cards, new cards and suspended cards', () => {
    const due = (card: CardDoc) => card.status !== 'new' && !card.suspended;
    expect(activeCards.filter((card) => due(card) && card.dueDate >= TODAY && card.dueDate <= TODAY_END).length)
      .toBeGreaterThanOrEqual(1);
    expect(activeCards.filter((card) => due(card) && card.dueDate < TODAY).length).toBeGreaterThanOrEqual(1);
    expect(activeCards.filter((card) => card.status === 'new').length).toBeGreaterThanOrEqual(1);
    expect(plan.cards.filter((card) => card.suspended).length).toBeGreaterThanOrEqual(1);
  });

  it('has an archived deck with cards and review history', () => {
    const archivedCards = plan.cards.filter((card) => archivedDeckIds.has(card.deck.toString()));
    expect(archivedCards.length).toBeGreaterThan(0);
    const archivedReviews = plan.reviews.filter((review) => archivedDeckIds.has(review.deck.toString()));
    expect(archivedReviews.length).toBeGreaterThan(0);
  });

  it('has a streak of at least a week that ends today', () => {
    const days = plan.reviews.map((review) => utcDayKey(review.reviewedAt));
    expect(utcDayKey(plan.reviews.reduce((latest, review) => (review.reviewedAt > latest.reviewedAt ? review : latest)).reviewedAt))
      .toBe(utcDayKey(NOW));
    expect(currentStreak(days, NOW)).toBeGreaterThanOrEqual(7);
  });
});

describe('determinism', () => {
  it('the same anchor gives the same review history', () => {
    const again = buildSeedPlan(NOW);
    expect(again.reviews.map((review) => [review.rating, review.newInterval, review.reviewedAt.getTime()]))
      .toEqual(plan.reviews.map((review) => [review.rating, review.newInterval, review.reviewedAt.getTime()]));
  });
});
