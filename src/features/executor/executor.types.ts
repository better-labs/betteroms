import type { Trade } from '../../domain/schemas/trade-plan.schema.js';

/**
 * Execution result for a single trade
 */
export interface ExecutionResult {
  orderId: string;
  trade: Trade;
  fillPrice?: number; // Undefined for open LIMIT orders
  quantity?: number; // Undefined for open LIMIT orders
  status: 'filled' | 'open' | 'failed';
  executedAt: Date;
  errorMessage?: string;
}

/**
 * Position data for a specific market token
 */
export interface Position {
  marketTokenId: string;
  outcome: 'YES' | 'NO';
  netQuantity: number; // Positive = long, negative = short, zero = flat
  avgPrice: number; // Weighted average entry price
  realizedPnL: number; // Locked-in profit/loss from closed trades
  unrealizedPnL?: number; // Current P&L (requires current market price)
}

/**
 * Execution context for a trade
 * Contains all data needed to execute and persist a trade
 */
export interface ExecutionContext {
  planId: string;
  mode: 'paper' | 'live';
  trade: Trade;
}

/**
 * Fill simulation result
 */
export interface FillSimulation {
  fillPrice: number;
  quantity: number;
  executedAt: Date;
}
