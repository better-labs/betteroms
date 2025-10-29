/**
 * Trade Runner Types
 *
 * Phase 6: Orchestration types for trade plan execution
 */

/**
 * Position summary for a specific market token
 */
export interface Position {
  marketTokenId: string;
  outcome: 'YES' | 'NO';
  netQuantity: number; // Can be negative for short positions
  avgPrice: number;
  totalCost: number; // Total USDC spent/received
  realizedPnL: number; // Realized profit/loss from closed positions
}

/**
 * Run summary generated after trade plan execution
 */
export interface RunSummary {
  planId: string;
  mode: 'paper' | 'live';
  ordersPlaced: number;
  ordersFilled: number;
  ordersOpen: number; // LIMIT orders waiting for price (Phase 7)
  ordersPartiallyFilled: number;
  ordersFailed: number;
  totalPnL: number; // Total realized P&L across all trades
  positions: Position[];
  errors?: string[]; // List of error messages if any trades failed
  startedAt: Date;
  completedAt: Date;
  durationMs: number;
}

/**
 * Execution result for a single trade
 */
export interface TradeExecutionResult {
  orderId: string;
  status: 'filled' | 'partially_filled' | 'failed';
  fillPrice?: number;
  fillQuantity?: number;
  errorMessage?: string;
}
