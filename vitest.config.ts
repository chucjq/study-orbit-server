import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // `src/config/env.ts` exits the process when MONGO_URI is missing; tests never connect to it.
    env: {
      MONGO_URI: 'mongodb://localhost:27017/study-orbit-test',
      CLIENT_ORIGIN: 'http://localhost:5173',
    },
  },
});
