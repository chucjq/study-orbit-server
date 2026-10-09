import type { Types } from 'mongoose';
import type { CardResponse } from '../types/api';
import type { CardStatus } from '../types/domain';
import { overdueDays } from './due';

export interface CardLike {
  _id: Types.ObjectId;
  front: string;
  back: string;
  tags: string[];
  easeFactor: number;
  intervalDays: number;
  repetitions: number;
  lapses: number;
  dueDate: Date;
  lastReviewedAt?: Date | null | undefined;
  status: CardStatus;
  suspended: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface DeckFlags {
  _id: Types.ObjectId;
  archived: boolean;
}

export function toCardResponse(card: CardLike, deck: DeckFlags, now: Date): CardResponse {
  return {
    _id: card._id.toString(),
    deck: deck._id.toString(),
    front: card.front,
    back: card.back,
    tags: [...card.tags],
    easeFactor: card.easeFactor,
    intervalDays: card.intervalDays,
    repetitions: card.repetitions,
    lapses: card.lapses,
    dueDate: card.dueDate.toISOString(),
    lastReviewedAt: card.lastReviewedAt ? card.lastReviewedAt.toISOString() : null,
    status: card.status,
    suspended: card.suspended,
    overdueDays: overdueDays(card, deck.archived, now),
    createdAt: card.createdAt.toISOString(),
    updatedAt: card.updatedAt.toISOString(),
  };
}
