import type { Types } from 'mongoose';
import type { ReviewResponse } from '../types/api';
import type { CardStatus, Rating } from '../types/domain';

export interface ReviewLike {
  _id: Types.ObjectId;
  card: Types.ObjectId;
  deck: Types.ObjectId;
  session?: Types.ObjectId | null | undefined;
  rating: Rating;
  previousStatus: CardStatus;
  newStatus: CardStatus;
  previousInterval: number;
  newInterval: number;
  easeFactorAfter: number;
  timeSpentMs?: number | null | undefined;
  reviewedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export function toReviewResponse(review: ReviewLike): ReviewResponse {
  return {
    _id: review._id.toString(),
    card: review.card.toString(),
    deck: review.deck.toString(),
    ...(review.session ? { session: review.session.toString() } : {}),
    rating: review.rating,
    previousStatus: review.previousStatus,
    newStatus: review.newStatus,
    previousInterval: review.previousInterval,
    newInterval: review.newInterval,
    easeFactorAfter: review.easeFactorAfter,
    ...(typeof review.timeSpentMs === 'number' ? { timeSpentMs: review.timeSpentMs } : {}),
    reviewedAt: review.reviewedAt.toISOString(),
    createdAt: review.createdAt.toISOString(),
    updatedAt: review.updatedAt.toISOString(),
  };
}
