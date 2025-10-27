import { AppError } from './base.error';

/**
 * Execution Error
 *
 * Thrown when trade execution fails due to business logic constraints
 * or external API failures.
 */
export class ExecutionError extends AppError {
  constructor(
    message: string,
    options?: {
      details?: Record<string, unknown>;
      cause?: Error;
      statusCode?: number;
    }
  ) {
    super(message, {
      name: 'ExecutionError',
      isOperational: true,
      statusCode: options?.statusCode || 500,
      details: options?.details,
      cause: options?.cause,
    });
  }
}

/**
 * Insufficient Position Error
 *
 * Thrown when attempting to SELL more than the current position.
 */
export class InsufficientPositionError extends ExecutionError {
  constructor(marketId: string, outcome: string, requested: number, available: number) {
    super(`Insufficient position to execute SELL order`, {
      details: {
        marketId,
        outcome,
        requested,
        available,
      },
    });
  }
}

/**
 * Duplicate Plan Error
 *
 * Thrown when attempting to execute a plan ID that has already been executed.
 */
export class DuplicatePlanError extends ExecutionError {
  constructor(planId: string) {
    super(`Plan ID "${planId}" has already been executed`, {
      statusCode: 409,
      details: {
        planId,
      },
    });
  }
}

/**
 * Market Not Found Error
 *
 * Thrown when a market ID cannot be resolved.
 */
export class MarketNotFoundError extends ExecutionError {
  constructor(marketId: string) {
    super(`Market not found: ${marketId}`, {
      statusCode: 404,
      details: {
        marketId,
      },
    });
  }
}
