import { describe, expect, it } from 'vitest';
import { sessionTotalsPipeline, summarize } from './sessionSummary';

describe('summarize', () => {
  it('is all zeros when the session has no reviews', () => {
    expect(summarize(undefined)).toEqual({ cardsReviewed: 0, correctCount: 0, accuracy: 0, totalTimeMs: 0 });
    expect(summarize({ cardsReviewed: 0, correctCount: 0, totalTimeMs: 0 })).toEqual({
      cardsReviewed: 0,
      correctCount: 0,
      accuracy: 0,
      totalTimeMs: 0,
    });
  });

  it.each([
    [4, 3, 75],
    [3, 1, 33.3],
    [3, 2, 66.7],
    [8, 7, 87.5],
    [7, 1, 14.3],
    [5, 5, 100],
    [5, 0, 0],
    [1, 1, 100],
  ])('%i reviews, %i correct -> accuracy %f', (cardsReviewed, correctCount, accuracy) => {
    expect(summarize({ cardsReviewed, correctCount, totalTimeMs: 0 }).accuracy).toBe(accuracy);
  });

  it('passes the counts and the total time through', () => {
    expect(summarize({ cardsReviewed: 6, correctCount: 4, totalTimeMs: 18250 })).toEqual({
      cardsReviewed: 6,
      correctCount: 4,
      accuracy: 66.7,
      totalTimeMs: 18250,
    });
  });
});

describe('sessionTotalsPipeline', () => {
  it('matches one session and counts non-again ratings as correct, missing times as 0', () => {
    expect(sessionTotalsPipeline('S')).toEqual([
      { $match: { session: 'S' } },
      {
        $group: {
          _id: null,
          cardsReviewed: { $sum: 1 },
          correctCount: { $sum: { $cond: [{ $ne: ['$rating', 'again'] }, 1, 0] } },
          totalTimeMs: { $sum: { $ifNull: ['$timeSpentMs', 0] } },
        },
      },
    ]);
  });
});
