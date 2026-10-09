// Domain unions are defined once here (const array + derived type) and reused by
// Mongoose schemas, Zod schemas and the scheduler.
export const RATINGS = ['again', 'hard', 'good', 'easy'] as const;
export type Rating = (typeof RATINGS)[number];

export const CARD_STATUSES = ['new', 'learning', 'review', 'mastered'] as const;
export type CardStatus = (typeof CARD_STATUSES)[number];

export const SESSION_STATUSES = ['active', 'completed'] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];
