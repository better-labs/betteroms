import { z } from 'zod';

/**
 * Trade Plan Schema v0.0.4
 *
 * This is the single source of truth for trade plan validation.
 * JSON Schema is auto-generated from this Zod schema.
 */

export const TRADE_PLAN_SCHEMA_VERSION = 'v0.0.4';

// Enum schemas
export const OutcomeSchema = z.enum(['YES', 'NO'], {
  errorMap: () => ({ message: 'Outcome must be either "YES" or "NO"' }),
});

export const SideSchema = z.enum(['BUY', 'SELL'], {
  errorMap: () => ({ message: 'Side must be either "BUY" or "SELL"' }),
});

export const OrderTypeSchema = z.enum(['MARKET', 'LIMIT'], {
  errorMap: () => ({ message: 'Order type must be either "MARKET" or "LIMIT"' }),
});

export const ModeSchema = z.enum(['paper', 'live'], {
  errorMap: () => ({ message: 'Mode must be either "paper" or "live"' }),
});

// Trade schema with conditional validation
export const TradeSchema = z
  .object({
    marketId: z
      .string()
      .min(1, 'Market ID is required and cannot be empty')
      .describe('Market identifier (hex ID starting with 0x or human-readable slug)'),

    outcome: OutcomeSchema.describe('Outcome to trade: YES or NO'),

    side: SideSchema.describe('Order side: BUY to acquire position, SELL to reduce position'),

    orderType: OrderTypeSchema.describe('Order type: MARKET for immediate execution, LIMIT for specified price'),

    size: z
      .number()
      .positive('Size must be greater than 0')
      .describe('Order size in USDC collateral (e.g., 100 = $100 worth)'),

    price: z
      .number()
      .gt(0, 'Price must be greater than 0')
      .lt(1, 'Price must be less than 1')
      .optional()
      .describe('Limit price (required for LIMIT orders, ignored for MARKET orders)'),
  })
  .refine(
    (data) => {
      // If orderType is LIMIT, price must be provided
      if (data.orderType === 'LIMIT' && data.price === undefined) {
        return false;
      }
      return true;
    },
    {
      message: 'Price is required for LIMIT orders',
      path: ['price'],
    }
  );

// Trade Plan schema
export const TradePlanSchema = z.object({
  planId: z
    .string()
    .min(1, 'Plan ID is required and cannot be empty')
    .regex(
      /^[a-zA-Z0-9-_]+$/,
      'Plan ID must contain only alphanumeric characters, hyphens, and underscores'
    )
    .describe('Unique identifier for this trade plan execution (used for idempotency)'),

  mode: ModeSchema.describe("Execution mode: 'paper' for simulation, 'live' for real trading"),

  trades: z
    .array(TradeSchema)
    .min(1, 'At least one trade is required')
    .describe('List of trades to execute in this plan'),
});

// Export TypeScript types inferred from Zod schemas
export type Outcome = z.infer<typeof OutcomeSchema>;
export type Side = z.infer<typeof SideSchema>;
export type OrderType = z.infer<typeof OrderTypeSchema>;
export type Mode = z.infer<typeof ModeSchema>;
export type Trade = z.infer<typeof TradeSchema>;
export type TradePlan = z.infer<typeof TradePlanSchema>;
