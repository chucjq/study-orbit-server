/** One row of the reviews-per-session aggregation. */
export interface ReviewTotals {
  cardsReviewed: number;
  correctCount: number;
  totalTimeMs: number;
}

export interface SessionSummary extends ReviewTotals {
  accuracy: number;
}

/** Pipeline that totals the reviews of one session (a missing `timeSpentMs` counts as 0). */
export function sessionTotalsPipeline<T>(sessionId: T) {
  return [
    { $match: { session: sessionId } },
    {
      $group: {
        _id: null,
        cardsReviewed: { $sum: 1 },
        // "Correct" means any rating other than `again`.
        correctCount: { $sum: { $cond: [{ $ne: ['$rating', 'again'] }, 1, 0] } },
        totalTimeMs: { $sum: { $ifNull: ['$timeSpentMs', 0] } },
      },
    },
  ];
}

/** Turns the aggregation row (absent when the session has no reviews) into the session summary. */
export function summarize(totals: ReviewTotals | undefined): SessionSummary {
  if (!totals || totals.cardsReviewed === 0) {
    return { cardsReviewed: 0, correctCount: 0, accuracy: 0, totalTimeMs: 0 };
  }
  const accuracy = Math.round((totals.correctCount / totals.cardsReviewed) * 1000) / 10;
  return {
    cardsReviewed: totals.cardsReviewed,
    correctCount: totals.correctCount,
    accuracy,
    totalTimeMs: totals.totalTimeMs,
  };
}
