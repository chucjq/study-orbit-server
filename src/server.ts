import mongoose from 'mongoose';
import app from './app';
import { env } from './config/env';
import { initModels } from './models';

async function main(): Promise<void> {
  try {
    await mongoose.connect(env.MONGO_URI);
    console.log('Connected to MongoDB');
    await initModels();
    app.listen(env.PORT, () => {
      console.log(`Server listening on port ${env.PORT}`);
    });
  } catch (error: unknown) {
    console.error('Failed to start server:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

void main();
