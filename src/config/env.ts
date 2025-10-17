import { z } from 'zod';
import { config } from 'dotenv';

/**
 * Environment variable schema for BetterOMS
 * Phase 1: Only CLOB client configuration required
 * Phase 2+: Add DATABASE_URL requirement
 */
const envSchema = z.object({
  // Node Environment
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),

  // Database (optional in Phase 1, required in Phase 2+)
  DATABASE_URL: z.string().url().optional(),

  // Polymarket CLOB Configuration (Phase 1+)
  CLOB_API_URL: z.string().url().default('https://clob.polymarket.com'),
  CHAIN_ID: z.string().default('137'),

  // Logging
  LOG_LEVEL: z
    .enum(['debug', 'info', 'warn', 'error'])
    .default('info')
    .optional(),

  // Live Trading Credentials (Phase 3+)
  POLYMARKET_API_KEY: z.string().optional(),
  POLYMARKET_API_SECRET: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Load and validate environment variables
 * Call this function early in application startup (e.g., in cli.ts)
 */
export function loadEnv(): Env {
  // Load .env.local file
  config({ path: '.env.local' });

  // Validate and parse environment variables
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error('❌ Invalid environment variables:');
    console.error(result.error.format());
    throw new Error('Environment validation failed');
  }

  return result.data;
}

/**
 * Cached environment variables
 * Use this export after calling loadEnv()
 */
let cachedEnv: Env | null = null;

export function getEnv(): Env {
  if (!cachedEnv) {
    cachedEnv = loadEnv();
  }
  return cachedEnv;
}

// Export individual env vars for convenience
export const env = {
  get NODE_ENV() {
    return getEnv().NODE_ENV;
  },
  get DATABASE_URL() {
    return getEnv().DATABASE_URL;
  },
  get CLOB_API_URL() {
    return getEnv().CLOB_API_URL;
  },
  get CHAIN_ID() {
    return getEnv().CHAIN_ID;
  },
  get LOG_LEVEL() {
    return getEnv().LOG_LEVEL;
  },
  get POLYMARKET_API_KEY() {
    return getEnv().POLYMARKET_API_KEY;
  },
  get POLYMARKET_API_SECRET() {
    return getEnv().POLYMARKET_API_SECRET;
  },
};
