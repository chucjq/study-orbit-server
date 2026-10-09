import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ quiet: true });

export function parseOrigins(value: string): string[] {
  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

function isPlainOrigin(value: string): boolean {
  try {
    return new URL(value).origin === value;
  } catch {
    return false;
  }
}

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(5000),
  MONGO_URI: z.string({ error: 'MONGO_URI is required' }).min(1, 'MONGO_URI is required'),
  // One origin, or several separated by commas.
  CLIENT_ORIGIN: z
    .string()
    .default('http://localhost:5173')
    .transform(parseOrigins)
    .refine((origins) => origins.length > 0, 'at least one origin is required')
    .refine(
      (origins) => origins.every(isPlainOrigin),
      'each origin must be scheme, host and optional port, with no trailing slash or path',
    ),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    console.error(`Invalid environment configuration:\n${problems}`);
    console.error('Copy .env.example to .env and fill in the values.');
    process.exit(1);
  }
  return result.data;
}

// The only place in the codebase allowed to read process.env.
export const env: Env = loadEnv();
