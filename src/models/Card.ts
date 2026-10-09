import { type InferSchemaType, model, Schema } from 'mongoose';
import { CARD_STATUSES } from '../types/domain';
import { startOfUtcDay } from '../utils/dates';
import { integer } from './validators';

const MAX_TAGS = 10;

const cardSchema = new Schema(
  {
    deck: { type: Schema.Types.ObjectId, ref: 'Deck', required: [true, 'deck is required'] },
    front: { type: String, required: [true, 'front is required'], trim: true, maxlength: 500 },
    back: { type: String, required: [true, 'back is required'], trim: true, maxlength: 1000 },
    tags: {
      type: [{ type: String, trim: true }],
      default: [],
      validate: {
        validator: (tags: string[]) => tags.length <= MAX_TAGS,
        message: `tags can have at most ${MAX_TAGS} items`,
      },
    },
    // Scheduling state: changed only by the review endpoint (see utils/schedule.ts).
    easeFactor: { type: Number, default: 2.5, min: 1.3 },
    intervalDays: { type: Number, default: 0, min: 0, validate: integer },
    repetitions: { type: Number, default: 0, min: 0, validate: integer },
    lapses: { type: Number, default: 0, min: 0, validate: integer },
    dueDate: { type: Date, default: () => startOfUtcDay(new Date()) },
    lastReviewedAt: { type: Date, default: null },
    status: { type: String, enum: CARD_STATUSES, default: 'new' },
    suspended: { type: Boolean, default: false },
  },
  { timestamps: true },
);

cardSchema.index({ deck: 1, status: 1, dueDate: 1 });
cardSchema.index({ tags: 1 });

export type CardFields = InferSchemaType<typeof cardSchema>;
export const Card = model('Card', cardSchema);
