import { type InferSchemaType, model, Schema } from 'mongoose';
import { SESSION_STATUSES } from '../types/domain';
import { integer } from './validators';

const sessionSchema = new Schema(
  {
    deck: { type: Schema.Types.ObjectId, ref: 'Deck', required: [true, 'deck is required'] },
    status: { type: String, enum: SESSION_STATUSES, default: 'active' },
    startedAt: { type: Date, default: Date.now },
    endedAt: { type: Date, default: null },
    cardsReviewed: { type: Number, default: 0, min: 0, validate: integer },
    correctCount: { type: Number, default: 0, min: 0, validate: integer },
    accuracy: { type: Number, default: 0, min: 0, max: 100 },
    totalTimeMs: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
);

sessionSchema.index({ deck: 1, status: 1, startedAt: -1 });

export type SessionFields = InferSchemaType<typeof sessionSchema>;
export const Session = model('Session', sessionSchema);
