/**
 * Polymarket API type definitions
 *
 * These types describe the shape of data returned from the Polymarket CLOB API
 * via the @polymarket/clob-client library.
 */

/**
 * Order book entry (bid or ask)
 */
export interface OrderBookEntry {
  price: string;
  size: string;
}

/**
 * Complete order book snapshot
 */
export interface OrderBook {
  market: string;
  asset_id: string;
  bids: OrderBookEntry[];
  asks: OrderBookEntry[];
  timestamp: number;
}

/**
 * Market metadata
 */
export interface Market {
  condition_id: string;
  question_id: string;
  tokens: MarketToken[];
  end_date_iso: string;
  game_start_time: string;
  question: string;
  description: string;
  active: boolean;
}

/**
 * Market token (outcome)
 */
export interface MarketToken {
  token_id: string;
  outcome: string;
  price: number;
  winner: boolean;
}

/**
 * Trade execution
 */
export interface Trade {
  id: string;
  market: string;
  asset_id: string;
  side: 'BUY' | 'SELL';
  price: string;
  size: string;
  timestamp: number;
  outcome: string;
}

/**
 * Price data point
 */
export interface PricePoint {
  price: number;
  timestamp: number;
}
