import { ClobClient } from '@polymarket/clob-client';
import { env } from '../../config/env.js';
import { logger } from '../../infrastructure/logging/logger.js';

/**
 * Initialize Polymarket CLOB client
 *
 * Phase 1: Read-only client (no authentication)
 * Phase 3+: Add signer for live trading
 *
 * @returns Configured ClobClient instance
 */
export function createClobClient(): ClobClient {
  const host = env.CLOB_API_URL;
  const chainId = parseInt(env.CHAIN_ID, 10);

  logger.info({ host, chainId }, 'Initializing Polymarket CLOB client');

  // Phase 1: Create client without signer (read-only mode)
  // Phase 3+ will add: new ClobClient(host, chainId, signer)
  const client = new ClobClient(host, chainId);

  return client;
}

/**
 * Singleton CLOB client instance
 * Lazy initialization on first access
 */
let clobClientInstance: ClobClient | null = null;

export function getClobClient(): ClobClient {
  if (!clobClientInstance) {
    clobClientInstance = createClobClient();
  }
  return clobClientInstance;
}
