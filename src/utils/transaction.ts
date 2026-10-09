import mongoose, { type ClientSession } from 'mongoose';

/**
 * Runs `work` inside one MongoDB transaction and always ends the session. Pass the given
 * `session` to every write in `work`. If `work` throws, nothing is committed. Transactions
 * need a replica set (Atlas clusters are one).
 */
export async function runInTransaction(work: (session: ClientSession) => Promise<void>): Promise<void> {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await work(session);
    });
  } finally {
    await session.endSession();
  }
}
