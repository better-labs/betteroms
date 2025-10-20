/**
 * Application-wide constants for BetterOMS
 */

/**
 * Example token IDs for testing
 * Note: These are examples and may not always be active.
 * For live testing, use current active markets from Polymarket.
 *
 * To find active token IDs:
 * 1. Visit https://polymarket.com
 * 2. Select a market
 * 3. Use browser dev tools to inspect API calls
 * 4. Look for token_id in API responses
 */
export const EXAMPLE_TOKEN_IDS = {
  // These are example token IDs - they may not always have active orderbooks
  EXAMPLE_YES_TOKEN:
    '21742633143463906290569050155826241533067272736897614950488156847949938836455',
  EXAMPLE_NO_TOKEN:
    '71321045679252212594626385532706912750332728571942532289631379312455583992833',
};

/**
 * Polymarket API endpoints
 */
export const POLYMARKET_ENDPOINTS = {
  CLOB_API: 'https://clob.polymarket.com',
  GAMMA_API: 'https://gamma-api.polymarket.com',
};

/**
 * Chain configuration
 */
export const CHAIN_CONFIG = {
  POLYGON_MAINNET_CHAIN_ID: 137,
};

/**
 * Order types supported in Phase 1
 */
export const ORDER_TYPES = {
  MARKET: 'MARKET',
  LIMIT: 'LIMIT', // Phase 2+
} as const;

/**
 * Order sides
 */
export const ORDER_SIDES = {
  BUY: 'BUY',
  SELL: 'SELL',
} as const;

/**
 * Execution modes
 */
export const EXECUTION_MODES = {
  PAPER: 'paper',
  LIVE: 'live', // Phase 3+
} as const;

/**
 * Order outcomes (YES/NO markets)
 */
export const OUTCOMES = {
  YES: 'YES',
  NO: 'NO',
} as const;
