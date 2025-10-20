import { getClobClient } from './clob-client.js';
import { logger } from '../../infrastructure/logging/logger.js';
import type { OrderBookSummary } from '@polymarket/clob-client';

const adapterLogger = logger.child({ module: 'polymarket-adapter' });

/**
 * Domain-specific adapter for Polymarket CLOB operations
 *
 * Wraps @polymarket/clob-client with BetterOMS-specific abstractions
 * Phase 1: Read-only market data operations
 */
export class PolymarketAdapter {
  private client = getClobClient();

  /**
   * Fetch complete order book for a market
   *
   * @param tokenId - The token ID (market outcome identifier)
   * @returns Order book with bids and asks
   */
  async getOrderBook(tokenId: string): Promise<OrderBookSummary> {
    adapterLogger.debug({ tokenId }, 'Fetching order book');

    try {
      const orderBook = await this.client.getOrderBook(tokenId);
      adapterLogger.debug(
        {
          tokenId,
          bidCount: orderBook.bids?.length || 0,
          askCount: orderBook.asks?.length || 0,
        },
        'Order book fetched successfully'
      );
      return orderBook;
    } catch (error) {
      adapterLogger.error({ tokenId, error }, 'Failed to fetch order book');
      throw error;
    }
  }

  /**
   * Get the mid-point price for a market
   *
   * @param tokenId - The token ID
   * @returns Mid-point price (average of best bid and best ask)
   */
  async getMidPoint(tokenId: string): Promise<number> {
    adapterLogger.debug({ tokenId }, 'Fetching mid-point price');

    try {
      const midPoint = await this.client.getMidpoint(tokenId);
      adapterLogger.debug({ tokenId, midPoint }, 'Mid-point price fetched');
      return midPoint;
    } catch (error) {
      adapterLogger.error({ tokenId, error }, 'Failed to fetch mid-point');
      throw error;
    }
  }

  /**
   * Get the last trade price for a market
   *
   * @param tokenId - The token ID
   * @returns Last trade price
   */
  async getLastTradePrice(tokenId: string): Promise<number> {
    adapterLogger.debug({ tokenId }, 'Fetching last trade price');

    try {
      const lastPrice = await this.client.getLastTradePrice(tokenId);
      adapterLogger.debug({ tokenId, lastPrice }, 'Last trade price fetched');
      return lastPrice;
    } catch (error) {
      adapterLogger.error(
        { tokenId, error },
        'Failed to fetch last trade price'
      );
      throw error;
    }
  }

  /**
   * Get the spread (difference between best ask and best bid)
   *
   * @param tokenId - The token ID
   * @returns Spread value
   */
  async getSpread(tokenId: string): Promise<number> {
    adapterLogger.debug({ tokenId }, 'Fetching spread');

    try {
      const spread = await this.client.getSpread(tokenId);
      adapterLogger.debug({ tokenId, spread }, 'Spread fetched');
      return spread;
    } catch (error) {
      adapterLogger.error({ tokenId, error }, 'Failed to fetch spread');
      throw error;
    }
  }

  /**
   * Get best bid and ask prices with mid-point
   *
   * @param tokenId - The token ID
   * @returns Object with bestBid, bestAsk, and midPoint prices
   */
  async getBestPrices(tokenId: string): Promise<{
    bestBid: number | null;
    bestAsk: number | null;
    midPoint: number;
  }> {
    adapterLogger.debug({ tokenId }, 'Fetching best prices');

    try {
      const [orderBook, midPoint] = await Promise.all([
        this.getOrderBook(tokenId),
        this.getMidPoint(tokenId),
      ]);

      const bestBid = orderBook.bids?.[0]?.price
        ? parseFloat(orderBook.bids[0].price)
        : null;
      const bestAsk = orderBook.asks?.[0]?.price
        ? parseFloat(orderBook.asks[0].price)
        : null;

      adapterLogger.debug(
        { tokenId, bestBid, bestAsk, midPoint },
        'Best prices fetched'
      );

      return { bestBid, bestAsk, midPoint };
    } catch (error) {
      adapterLogger.error({ tokenId, error }, 'Failed to fetch best prices');
      throw error;
    }
  }
}

/**
 * Singleton adapter instance
 */
let adapterInstance: PolymarketAdapter | null = null;

export function getPolymarketAdapter(): PolymarketAdapter {
  if (!adapterInstance) {
    adapterInstance = new PolymarketAdapter();
  }
  return adapterInstance;
}
