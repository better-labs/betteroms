import { defineConfig } from 'drizzle-kit';
import { config } from 'dotenv';

// Load .env.local
const result = config({ path: '.env.local' });

const directUrl = process.env.DATABASE_URL;

// Debug logging (only if DEBUG_DRIZZLE is set)
if (process.env.DEBUG_DRIZZLE) {
  console.log('=== Drizzle Config Debug ===');
  console.log('dotenv result:', result.error ? `ERROR: ${result.error}` : 'SUCCESS');
  console.log('DATABASE_URL loaded:', directUrl ? 'YES' : 'NO');
  if (directUrl) {
    // Mask password for security
    const masked = directUrl.replace(/:([^@]+)@/, ':****@');
    console.log('DATABASE_URL (masked):', masked);
  }
  console.log('===========================\n');
}

if (!directUrl) {
  throw new Error('DATABASE_URL is required for Drizzle migrations.');
}

export default defineConfig({
  schema: './src/infrastructure/database/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: directUrl,
  },
});
