import { type InferSchemaType, model, Schema } from 'mongoose';
import { colorField } from './validators';

export const DEFAULT_SUBJECT_COLOR = '#6366f1';

const subjectSchema = new Schema(
  {
    name: { type: String, required: [true, 'name is required'], trim: true, minlength: 2, maxlength: 40 },
    color: colorField(DEFAULT_SUBJECT_COLOR),
    icon: { type: String, trim: true, maxlength: 4 },
  },
  { timestamps: true },
);

// Unique name, compared case-insensitively ("Math" and "math" collide).
subjectSchema.index({ name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });

export type SubjectFields = InferSchemaType<typeof subjectSchema>;
export const Subject = model('Subject', subjectSchema);
