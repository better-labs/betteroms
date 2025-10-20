import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import postgres from 'postgres';
import { env } from '../../config/env.js';
import { logger } from '../logging/logger.js';
import * as schema from './schema.js';

const dbLogger = logger.child({ module: 'database' });

/**
 * Postgres connection client
 * Uses connection pooling for optimal performance
 */
let client: postgres.Sql | null = null;
let db: ReturnType<typeof drizzle> | null = null;

/**
 * Initialize database connection
 * Creates a singleton connection pool
 */
function initializeClient() {
  if (!env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not configured');
  }

  dbLogger.info('Initializing database connection...');

  // Create postgres client with connection pooling
  client = postgres(env.DATABASE_URL, {
    max: 10, // Maximum number of connections in pool
    idle_timeout: 20, // Close idle connections after 20 seconds
    connect_timeout: 10, // Connection timeout in seconds
  });

  // Create Drizzle instance with schema
  db = drizzle(client, { schema });

  dbLogger.info('Database connection initialized');

  return db;
}

/**
 * Get database instance
 * Lazy initialization - creates connection on first access
 *
 * @returns Drizzle database instance
 */
export function getDb() {
  if (!db) {
    return initializeClient();
  }
  return db;
}

/**
 * Close database connection
 * Use this for graceful shutdown
 */
export async function closeDb() {
  if (client) {
    dbLogger.info('Closing database connection...');
    await client.end();
    client = null;
    db = null;
    dbLogger.info('Database connection closed');
  }
}

/**
 * Test database connectivity
 * Useful for health checks and startup validation
 *
 * @returns true if connection successful, false otherwise
 */
export async function testConnection(): Promise<boolean> {
  try {
    dbLogger.debug('Testing database connection...');
    const database = getDb();

    // Simple query to test connection
    await database.execute(sql`SELECT 1 as test`);

    dbLogger.info('Database connection test successful');
    return true;
  } catch (error) {
    dbLogger.error({ error }, 'Database connection test failed');
    return false;
  }
}

// Re-export sql template tag for raw queries
export { sql };
