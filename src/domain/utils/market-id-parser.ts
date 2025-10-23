/**
 * Market ID Parser
 *
 * Determines whether a market identifier is a:
 * - Hex/numeric ID (e.g., "0x1234567890abcdef...")
 * - Human-readable slug (e.g., "will-donald-trump-win-2024")
 *
 * Used by validators to distinguish format types before API calls.
 */

export type MarketIdType = 'id' | 'slug';

export interface ParsedMarketId {
  type: MarketIdType;
  value: string;
}

/**
 * Parse a market identifier and determine its type
 *
 * @param input - Market ID string from trade plan
 * @returns Parsed result with type and normalized value
 *
 * @example
 * parseMarketId('0x1234567890abcdef') // { type: 'id', value: '0x1234567890abcdef' }
 * parseMarketId('will-trump-win-2024') // { type: 'slug', value: 'will-trump-win-2024' }
 */
export function parseMarketId(input: string): ParsedMarketId {
  if (!input || input.trim().length === 0) {
    throw new Error('Market ID cannot be empty');
  }

  const trimmed = input.trim();

  // Check if it starts with '0x' (hex prefix)
  if (trimmed.startsWith('0x')) {
    return {
      type: 'id',
      value: trimmed,
    };
  }

  // Check if it's all hexadecimal characters (numeric ID without 0x prefix)
  const hexPattern = /^[0-9a-fA-F]+$/;
  if (hexPattern.test(trimmed)) {
    return {
      type: 'id',
      value: trimmed,
    };
  }

  // Otherwise, treat as human-readable slug
  return {
    type: 'slug',
    value: trimmed,
  };
}

/**
 * Validate that a market ID has correct format
 *
 * @param input - Market ID to validate
 * @returns true if valid, error message if invalid
 */
export function validateMarketIdFormat(input: string): true | string {
  if (!input || input.trim().length === 0) {
    return 'Market ID cannot be empty';
  }

  const trimmed = input.trim();
  const parsed = parseMarketId(trimmed);

  // For hex IDs, ensure they have reasonable length
  if (parsed.type === 'id') {
    if (trimmed.startsWith('0x')) {
      // Hex IDs typically 40-66 characters (0x + 20-32 bytes hex)
      if (trimmed.length < 10 || trimmed.length > 70) {
        return 'Hex market ID has invalid length';
      }
    } else {
      // Numeric IDs should be reasonable length
      if (trimmed.length < 1 || trimmed.length > 100) {
        return 'Numeric market ID has invalid length';
      }
    }
  }

  // For slugs, ensure they use valid characters
  if (parsed.type === 'slug') {
    const slugPattern = /^[a-z0-9-]+$/;
    if (!slugPattern.test(trimmed)) {
      return 'Market slug must contain only lowercase letters, numbers, and hyphens';
    }

    if (trimmed.length < 3 || trimmed.length > 200) {
      return 'Market slug must be between 3 and 200 characters';
    }
  }

  return true;
}
