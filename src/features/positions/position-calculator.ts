import { getExecutorRepository } from '../executor/executor.repository.js';
import type { Position } from '../executor/executor.types.js';
import { logger } from '../../infrastructure/logging/logger.js';

const positionLogger = logger.child({ module: 'position-calculator' });

/**
 * Calculate position for a market token
 *
 * Phase 1: Calculates on-the-fly from executions table
 * Phase 2+: Will use dedicated positions table for performance
 *
 * @param marketTokenId - Market token identifier
 * @param outcome - YES or NO
 * @param mode - paper or live
 * @returns Position with net quantity, average price, and P&L
 */
export async function calculatePosition(
  marketTokenId: string,
  outcome: 'YES' | 'NO',
  mode: 'paper' | 'live'
): Promise<Position | null> {
  positionLogger.debug({ marketTokenId, outcome, mode }, 'Calculating position');

  const repository = getExecutorRepository();
  const position = await repository.calculatePosition(marketTokenId, outcome, mode);

  if (!position) {
    positionLogger.debug(
      { marketTokenId, outcome, mode },
      'No position found for market token'
    );
    return null;
  }

  positionLogger.info(
    {
      marketTokenId,
      outcome,
      netQuantity: position.netQuantity,
      avgPrice: position.avgPrice,
    },
    'Position calculated'
  );

  return position;
}

/**
 * Calculate unrealized P&L for a position
 *
 * @param position - Position to calculate P&L for
 * @param currentPrice - Current market price for the outcome
 * @returns Unrealized P&L
 */
export function calculateUnrealizedPnL(
  position: Position,
  currentPrice: number
): number {
  if (position.netQuantity === 0) {
    return 0;
  }

  // For long positions: (current_price - avg_price) * quantity
  // For short positions: (avg_price - current_price) * abs(quantity)
  const unrealizedPnL =
    (currentPrice - position.avgPrice) * position.netQuantity;

  positionLogger.debug(
    {
      marketTokenId: position.marketTokenId,
      outcome: position.outcome,
      netQuantity: position.netQuantity,
      avgPrice: position.avgPrice,
      currentPrice,
      unrealizedPnL,
    },
    'Unrealized P&L calculated'
  );

  return unrealizedPnL;
}

/**
 * Validate that sufficient position exists for a SELL order
 *
 * @param marketTokenId - Market token identifier
 * @param outcome - YES or NO
 * @param mode - paper or live
 * @param requiredQuantity - Quantity needed for SELL order
 * @returns true if position is sufficient, false otherwise
 */
export async function validateSellPosition(
  marketTokenId: string,
  outcome: 'YES' | 'NO',
  mode: 'paper' | 'live',
  requiredQuantity: number
): Promise<{ valid: boolean; currentQuantity: number; message?: string }> {
  positionLogger.debug(
    { marketTokenId, outcome, mode, requiredQuantity },
    'Validating SELL position'
  );

  const position = await calculatePosition(marketTokenId, outcome, mode);

  if (!position || position.netQuantity <= 0) {
    const message = `No existing position found for market token ${marketTokenId} outcome ${outcome}. Cannot SELL without a position.`;
    positionLogger.warn({ marketTokenId, outcome }, message);
    return {
      valid: false,
      currentQuantity: position?.netQuantity || 0,
      message,
    };
  }

  if (position.netQuantity < requiredQuantity) {
    const message = `Insufficient position for market token ${marketTokenId} outcome ${outcome}. Required: ${requiredQuantity}, Available: ${position.netQuantity}`;
    positionLogger.warn(
      { marketTokenId, outcome, required: requiredQuantity, available: position.netQuantity },
      message
    );
    return {
      valid: false,
      currentQuantity: position.netQuantity,
      message,
    };
  }

  positionLogger.info(
    { marketTokenId, outcome, requiredQuantity, available: position.netQuantity },
    'SELL position validation passed'
  );

  return {
    valid: true,
    currentQuantity: position.netQuantity,
  };
}
