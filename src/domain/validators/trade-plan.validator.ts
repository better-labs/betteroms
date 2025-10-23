import { ZodError } from 'zod';
import { TradePlanSchema, TradePlan } from '../schemas/trade-plan.schema';
import { ValidationError } from '../errors/validation.error';
import { validateMarketIdFormat, parseMarketId } from '../utils/market-id-parser';
import { logger } from '../../infrastructure/logging/logger';

/**
 * Validate a trade plan against the Zod schema
 *
 * @param input - Raw JSON input to validate
 * @returns Validated and typed TradePlan object
 * @throws ValidationError if validation fails
 *
 * @example
 * const plan = validateTradePlan(jsonInput);
 * // plan is now typed as TradePlan with all fields validated
 */
export function validateTradePlan(input: unknown): TradePlan {
  try {
    // Step 1: Parse against Zod schema
    const parsed = TradePlanSchema.parse(input);

    // Step 2: Validate market IDs
    validateMarketIds(parsed);

    logger.debug({ planId: parsed.planId }, 'Trade plan validation successful');

    return parsed;
  } catch (error) {
    if (error instanceof ZodError) {
      // Convert Zod errors to ValidationError
      throw ValidationError.fromZodError(error, 'Invalid trade plan structure');
    }

    if (error instanceof ValidationError) {
      // Re-throw ValidationErrors from market ID validation
      throw error;
    }

    // Unexpected error
    logger.error({ error }, 'Unexpected error during trade plan validation');
    throw new ValidationError('Trade plan validation failed', [
      {
        field: 'unknown',
        message: error instanceof Error ? error.message : 'Unknown validation error',
        code: 'unknown_error',
      },
    ]);
  }
}

/**
 * Validate market IDs in all trades
 *
 * @param plan - Parsed trade plan
 * @throws ValidationError if any market ID is invalid
 */
function validateMarketIds(plan: TradePlan): void {
  const errors: Array<{ field: string; message: string; code: string }> = [];

  plan.trades.forEach((trade, index) => {
    try {
      const validationResult = validateMarketIdFormat(trade.marketId);

      if (validationResult !== true) {
        errors.push({
          field: `trades[${index}].marketId`,
          message: validationResult,
          code: 'invalid_market_id',
        });
      } else {
        // Log the parsed market ID type for debugging
        const parsed = parseMarketId(trade.marketId);
        logger.debug(
          {
            tradeIndex: index,
            marketId: trade.marketId,
            marketIdType: parsed.type,
          },
          'Market ID validated'
        );
      }
    } catch (error) {
      errors.push({
        field: `trades[${index}].marketId`,
        message: error instanceof Error ? error.message : 'Invalid market ID format',
        code: 'invalid_market_id',
      });
    }
  });

  if (errors.length > 0) {
    throw new ValidationError('One or more market IDs are invalid', errors);
  }
}

/**
 * Safe validation that returns a result object instead of throwing
 *
 * @param input - Raw JSON input to validate
 * @returns Result object with success flag and either data or error
 *
 * @example
 * const result = safeValidateTradePlan(jsonInput);
 * if (result.success) {
 *   console.log(result.data);
 * } else {
 *   console.error(result.error);
 * }
 */
export function safeValidateTradePlan(
  input: unknown
): { success: true; data: TradePlan } | { success: false; error: ValidationError } {
  try {
    const data = validateTradePlan(input);
    return { success: true, data };
  } catch (error) {
    if (error instanceof ValidationError) {
      return { success: false, error };
    }

    // Wrap unexpected errors
    return {
      success: false,
      error: new ValidationError('Validation failed', [
        {
          field: 'unknown',
          message: error instanceof Error ? error.message : 'Unknown error',
          code: 'unknown_error',
        },
      ]),
    };
  }
}
