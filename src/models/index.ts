import { Card } from './Card';
import { Deck } from './Deck';
import { Review } from './Review';
import { Session } from './Session';
import { Subject } from './Subject';

export { Card, Deck, Review, Session, Subject };
export type { CardFields } from './Card';
export type { DeckFields } from './Deck';
export type { ReviewFields } from './Review';
export type { SessionFields } from './Session';
export type { SubjectFields } from './Subject';

/**
 * Builds every model's indexes. Call (and await) it before relying on duplicate-key
 * behaviour: at server start, in the seed script and in tests.
 */
export async function initModels(): Promise<void> {
  await Promise.all([Subject.init(), Deck.init(), Card.init(), Review.init(), Session.init()]);
}
