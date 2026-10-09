import { type InferSchemaType, model, Schema } from 'mongoose';
import { colorField, integer } from './validators';

export const DEFAULT_DECK_COLOR = '#0ea5e9';
export const DEFAULT_DAILY_NEW_LIMIT = 10;

const deckSchema = new Schema(
  {
    title: { type: String, required: [true, 'title is required'], trim: true, minlength: 3, maxlength: 60 },
    subject: { type: Schema.Types.ObjectId, ref: 'Subject', required: [true, 'subject is required'] },
    description: { type: String, trim: true, maxlength: 300 },
    color: colorField(DEFAULT_DECK_COLOR),
    dailyNewLimit: { type: Number, default: DEFAULT_DAILY_NEW_LIMIT, min: 1, max: 100, validate: integer },
    archived: { type: Boolean, default: false },
  },
  { timestamps: true },
);

// A title is unique within its subject, case-insensitively.
deckSchema.index({ subject: 1, title: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });

export type DeckFields = InferSchemaType<typeof deckSchema>;
export const Deck = model('Deck', deckSchema);
