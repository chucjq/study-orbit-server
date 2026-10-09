import mongoose from 'mongoose';
import { env } from '../config/env';
import { Card, Deck, Review, Session, Subject, initModels } from '../models';
import { runInTransaction } from '../utils/transaction';
import { buildSeedPlan } from './seedPlan';

/**
 * `npm run seed`. Replaces all subjects, decks, cards, sessions and reviews in the database at
 * MONGO_URI with the demo data. Re-runnable: one transaction deletes the old data and inserts the
 * new plan, so a failure leaves the database as it was. Needs a replica set (Atlas is one).
 */
async function main(): Promise<void> {
  const plan = buildSeedPlan(new Date());

  await mongoose.connect(env.MONGO_URI);
  try {
    await initModels();
    console.log(`Seeding database "${mongoose.connection.name}" (this replaces all study data in it)...`);

    await runInTransaction(async (session) => {
      await Review.deleteMany({}, { session });
      await Session.deleteMany({}, { session });
      await Card.deleteMany({}, { session });
      await Deck.deleteMany({}, { session });
      await Subject.deleteMany({}, { session });

      await Subject.insertMany(plan.subjects, { session });
      await Deck.insertMany(plan.decks, { session });
      await Card.insertMany(plan.cards, { session });
      await Session.insertMany(plan.sessions, { session });
      await Review.insertMany(plan.reviews, { session });
    });

    console.log(
      `Seeded ${plan.subjects.length} subjects, ${plan.decks.length} decks, ${plan.cards.length} cards, ` +
        `${plan.sessions.length} sessions and ${plan.reviews.length} reviews.`,
    );
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error: unknown) => {
  console.error('Seed failed:', error);
  process.exitCode = 1;
});
