// Note: .env.local should be loaded before importing this module
// This is handled in cli.ts and drizzle.config.ts

// Use getters to access process.env dynamically (after .env.local is loaded)
export const env = {
  get DATABASE_URL() {
    return process.env.DATABASE_URL || '';
  },
  get OPENROUTER_API_KEY() {
    return process.env.OPENROUTER_API_KEY || '';
  },
  get NODE_ENV() {
    return process.env.NODE_ENV || 'development';
  },
};
