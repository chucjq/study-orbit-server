import { type InferSchemaType, model, Schema } from 'mongoose';
import { CARD_STATUSES, RATINGS } from '../types/domain';

const reviewSchema = new Schema(
  {
    card: { type: Schema.Types.ObjectId, ref: 'Card', required: [true, 'card is required'] },
    deck: { type: Schema.Types.ObjectId, ref: 'Deck', required: [true, 'deck is required'] },
    session: { type: Schema.Types.ObjectId, ref: 'Session' },
    rating: { type: String, enum: RATINGS, required: [true, 'rating is required'] },
    previousStatus: { type: String, enum: CARD_STATUSES, required: [true, 'previousStatus is required'] },
    newStatus: { type: String, enum: CARD_STATUSES, required: [true, 'newStatus is required'] },
    previousInterval: { type: Number, min: 0, required: [true, 'previousInterval is required'] },
    newInterval: { type: Number, min: 0, required: [true, 'newInterval is required'] },
    easeFactorAfter: { type: Number, min: 1.3, required: [true, 'easeFactorAfter is required'] },
    timeSpentMs: { type: Number, min: 0 },
    reviewedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

reviewSchema.index({ card: 1, reviewedAt: -1 });
reviewSchema.index({ deck: 1, reviewedAt: -1 });
reviewSchema.index({ session: 1 });
reviewSchema.index({ reviewedAt: -1 });

export type ReviewFields = InferSchemaType<typeof reviewSchema>;
export const Review = model('Review', reviewSchema);
