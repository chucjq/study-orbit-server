import type { CardStatus, Rating, SessionStatus } from './domain';

// API contract shared with the frontend. More response shapes are added with their endpoints.

/** Body of every error response. */
export interface ErrorResponse {
  message: string;
}

/** Uniform envelope of every list endpoint. `total` counts all matches, not just this page. */
export interface ListResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

/** A subject as returned by every subject endpoint. */
export interface SubjectResponse {
  _id: string;
  name: string;
  color: string;
  icon?: string;
  /** Number of decks in the subject, archived ones included. */
  deckCount: number;
  createdAt: string;
  updatedAt: string;
}

/** Body of a successful delete. */
export interface MessageResponse {
  message: string;
}

/** The part of a subject embedded in a deck. */
export interface DeckSubjectSummary {
  _id: string;
  name: string;
  color: string;
}

/** A deck as returned by every deck endpoint (list items have the same shape). */
export interface DeckResponse {
  _id: string;
  title: string;
  subject: DeckSubjectSummary;
  description?: string;
  color: string;
  dailyNewLimit: number;
  archived: boolean;
  /** All cards in the deck, suspended ones included. */
  cardCount: number;
  /** Cards due by the shared definition (`utils/due.ts`); 0 for an archived deck. */
  dueCount: number;
  createdAt: string;
  updatedAt: string;
}

/** A card as returned by every card endpoint. */
export interface CardResponse {
  _id: string;
  deck: string;
  front: string;
  back: string;
  tags: string[];
  easeFactor: number;
  intervalDays: number;
  repetitions: number;
  lapses: number;
  dueDate: string;
  lastReviewedAt: string | null;
  status: CardStatus;
  suspended: boolean;
  /** Whole UTC days overdue; 0 unless the card is overdue (always 0 for new, suspended and archived-deck cards). */
  overdueDays: number;
  createdAt: string;
  updatedAt: string;
}

/** `GET /api/study/queue`: what to study now. */
export interface QueueResponse {
  /** Due cards, most overdue first (at most `limit`). */
  due: CardResponse[];
  /** New cards within each deck's remaining daily limit, oldest first (at most `limit`). */
  new: CardResponse[];
  /** Totals available, before `limit` is applied; `total = due + new`. */
  counts: { due: number; new: number; total: number };
}

/** A review (one answer to one card) as returned by the review endpoints. */
export interface ReviewResponse {
  _id: string;
  card: string;
  deck: string;
  session?: string;
  rating: Rating;
  previousStatus: CardStatus;
  newStatus: CardStatus;
  previousInterval: number;
  newInterval: number;
  easeFactorAfter: number;
  timeSpentMs?: number;
  reviewedAt: string;
  createdAt: string;
  updatedAt: string;
}

/** Body of `POST /api/cards/:id/reviews`. */
export interface ReviewResult {
  review: ReviewResponse;
  /** The card after scheduling. */
  card: CardResponse;
}

/** A study session as returned by every session endpoint. */
export interface SessionResponse {
  _id: string;
  deck: string;
  status: SessionStatus;
  startedAt: string;
  /** `null` while the session is active. */
  endedAt: string | null;
  /** Summary counters: 0 while active, a snapshot taken when the session is finished. */
  cardsReviewed: number;
  correctCount: number;
  /** Percent of reviews not rated `again`, one decimal; 0 when there are no reviews. */
  accuracy: number;
  totalTimeMs: number;
  createdAt: string;
  updatedAt: string;
}

// ---- Stats (`/api/stats`) ----

/** `GET /api/stats/overview`: whole-database totals. Ratios are 0-100 with one decimal; 0 when empty. */
export interface StatsOverviewResponse {
  totalSubjects: number;
  /** Decks in every subject, archived ones included. */
  totalDecks: number;
  totalCards: number;
  /** Due by the shared definition (`utils/due.ts`), overdue included. */
  dueToday: number;
  reviewsToday: number;
  /** Cards per status, suspended ones included. */
  statusDistribution: Record<CardStatus, number>;
  /** Share of reviews of non-new cards not rated `again`. */
  retentionRate: number;
  /** Average ease factor of cards past `new`, two decimals. */
  averageEaseFactor: number;
  currentStreak: number;
  longestStreak: number;
}

/** `GET /api/stats/decks/:id`. */
export interface DeckStatsResponse {
  cardCount: number;
  statusDistribution: Record<CardStatus, number>;
  /** Mastered cards as a share of non-suspended cards, 0-100. */
  masteryPercent: number;
  retentionRate: number;
  averageEaseFactor: number;
  dueToday: number;
  /** Completed sessions only. */
  sessionCount: number;
  /** Average accuracy of completed sessions, one decimal; 0 when there are none. */
  averageSessionAccuracy: number;
}

/** One entry of `GET /api/stats/subjects`, ordered by `masteryPercent` descending. */
export interface SubjectStatsResponse {
  _id: string;
  name: string;
  deckCount: number;
  cardCount: number;
  masteryPercent: number;
  retentionRate: number;
}

/** One day of `GET /api/stats/activity`, UTC. */
export interface ActivityDay {
  /** `YYYY-MM-DD`. */
  date: string;
  reviews: number;
  /** Reviews not rated `again`. */
  correct: number;
}

/** One day of `GET /api/stats/forecast`, UTC. Day 0 is today and equals `dueToday`. */
export interface ForecastDay {
  /** `YYYY-MM-DD`. */
  date: string;
  count: number;
}
