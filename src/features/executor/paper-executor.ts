import { getPolymarketAdapter } from '../../integrations/polymarket/polymarket.adapter.js';
import { getExecutorRepository } from './executor.repository.js';
import { validateSellPosition } from '../positions/position-calculator.js';
import { logger } from '../../infrastructure/logging/logger.js';
import { ExecutionError } from '../../domain/errors/execution.error.js';
import type { Trade } from '../../domain/schemas/trade-plan.schema.js';
import type { ExecutionResult, FillSimulation } from './executor.types.js';

const paperLogger = logger.child({ module: 'paper-executor' });

/**
 * Paper Trading Executor
 *
 * Simulates trade execution using real market data from Polymarket CLOB.
 * Phase 1: MARKET orders only, zero slippage model.
 */
export class PaperExecutor {
  private adapter = getPolymarketAdapter();
  private repository = getExecutorRepository();

  /**
   * Execute a single trade in paper mode
   *
   * @param planId - Trade plan identifier
   * @param trade - Trade to execute
   * @returns Execution result with order and execution details
   */
  async executeTrade(planId: string, trade: Trade): Promise<ExecutionResult> {
    paperLogger.info(
      {
        planId,
        marketTokenId: trade.marketTokenId,
        outcome: trade.outcome,
        side: trade.side,
        orderType: trade.orderType,
        size: trade.size,
        price: trade.price,
      },
      'Starting paper trade execution'
    );

    try {
      // Step 1: Validate SELL orders have sufficient position (for MARKET orders only)
      // LIMIT SELL orders will be validated if/when they fill
      if (trade.side === 'SELL' && trade.orderType === 'MARKET') {
        await this.validateSellOrder(trade);
      }

      // Step 2: Simulate fill based on order type
      let fillSimulation: FillSimulation | null;

      if (trade.orderType === 'MARKET') {
        fillSimulation = await this.simulateMarketOrderFill(trade);
      } else if (trade.orderType === 'LIMIT') {
        fillSimulation = await this.simulateLimitOrderFill(trade);
      } else {
        throw new ExecutionError(
          `Order type ${trade.orderType} not supported.`,
          { details: { trade } }
        );
      }

      // Step 3: Persist order to database
      // If fillSimulation is null (LIMIT order didn't cross), create order without execution
      if (fillSimulation === null) {
        // LIMIT order stays open (did not cross spread)
        const order = await this.repository.createOrder({
          planId,
          marketTokenId: trade.marketTokenId,
          outcome: trade.outcome,
          side: trade.side,
          orderType: trade.orderType,
          size: trade.size.toString(),
          price: trade.price!.toString(), // LIMIT orders always have price
          status: 'open',
          mode: 'paper',
        });

        paperLogger.info(
          {
            orderId: order.id,
            limitPrice: trade.price,
            side: trade.side,
          },
          'LIMIT order created (waiting for price)'
        );

        return {
          orderId: order.id,
          trade,
          status: 'open',
          executedAt: new Date(),
        };
      } else {
        // Order fills immediately (MARKET or LIMIT that crosses spread)
        const { order, execution } = await this.repository.executeTradeTransaction(
          {
            planId,
            marketTokenId: trade.marketTokenId,
            outcome: trade.outcome,
            side: trade.side,
            orderType: trade.orderType,
            size: trade.size.toString(),
            price: trade.price?.toString() || null,
            status: 'open', // Will be updated to 'filled' in transaction
            mode: 'paper',
          },
          {
            quantity: fillSimulation.quantity.toString(),
            price: fillSimulation.fillPrice.toString(),
            executedAt: fillSimulation.executedAt,
          }
        );

        paperLogger.info(
          {
            orderId: order.id,
            executionId: execution.id,
            fillPrice: fillSimulation.fillPrice,
            quantity: fillSimulation.quantity,
          },
          'Paper trade executed successfully'
        );

        return {
          orderId: order.id,
          trade,
          fillPrice: fillSimulation.fillPrice,
          quantity: fillSimulation.quantity,
          status: 'filled',
          executedAt: fillSimulation.executedAt,
        };
      }
    } catch (error) {
      paperLogger.error(
        {
          planId,
          trade,
          error: error instanceof Error ? error.message : String(error),
        },
        'Paper trade execution failed'
      );

      if (error instanceof ExecutionError) {
        throw error;
      }

      throw new ExecutionError(
        `Failed to execute paper trade: ${error instanceof Error ? error.message : String(error)}`,
        { details: { trade }, cause: error instanceof Error ? error : undefined }
      );
    }
  }

  /**
   * Simulate MARKET order fill using order book data
   *
   * Phase 1: Zero slippage model
   * - BUY orders fill at best ask price
   * - SELL orders fill at best bid price
   * - Always fills 100% immediately
   *
   * @param trade - Trade to simulate
   * @returns Fill simulation with price and quantity
   */
  private async simulateMarketOrderFill(trade: Trade): Promise<FillSimulation> {
    paperLogger.debug(
      { marketTokenId: trade.marketTokenId, side: trade.side, size: trade.size },
      'Simulating MARKET order fill'
    );

    // Fetch order book for the market
    const orderBook = await this.adapter.getOrderBook(trade.marketTokenId);

    // Determine fill price based on side
    let fillPrice: number;

    if (trade.side === 'BUY') {
      // BUY at best ask (lowest sell price)
      if (!orderBook.asks || orderBook.asks.length === 0) {
        throw new ExecutionError(
          `No asks available in order book for market ${trade.marketTokenId}. Cannot execute BUY order.`,
          { details: { trade, marketTokenId: trade.marketTokenId } }
        );
      }

      fillPrice = parseFloat(orderBook.asks[0].price);
      paperLogger.debug(
        { bestAsk: fillPrice },
        'BUY order will fill at best ask'
      );
    } else {
      // SELL at best bid (highest buy price)
      if (!orderBook.bids || orderBook.bids.length === 0) {
        throw new ExecutionError(
          `No bids available in order book for market ${trade.marketTokenId}. Cannot execute SELL order.`,
          { details: { trade, marketTokenId: trade.marketTokenId } }
        );
      }

      fillPrice = parseFloat(orderBook.bids[0].price);
      paperLogger.debug(
        { bestBid: fillPrice },
        'SELL order will fill at best bid'
      );
    }

    // Validate fill price
    if (fillPrice <= 0 || fillPrice >= 1) {
      throw new ExecutionError(
        `Invalid fill price ${fillPrice} for market ${trade.marketTokenId}. Price must be between 0 and 1.`,
        { details: { trade, fillPrice, marketTokenId: trade.marketTokenId } }
      );
    }

    // Calculate quantity: tokens = size (USDC) / price
    // Example: $100 USDC / $0.40 per token = 250 tokens
    const quantity = trade.size / fillPrice;

    const fillSimulation: FillSimulation = {
      fillPrice,
      quantity,
      executedAt: new Date(),
    };

    paperLogger.info(
      {
        marketTokenId: trade.marketTokenId,
        side: trade.side,
        size: trade.size,
        fillPrice,
        quantity,
      },
      'MARKET order fill simulated'
    );

    return fillSimulation;
  }

  /**
   * Simulate LIMIT order fill using order book data
   *
   * Phase 7: LIMIT order crossing logic
   * - BUY LIMIT: Fills if limit price >= best ask (willing to pay more)
   * - SELL LIMIT: Fills if limit price <= best bid (willing to accept less)
   * - Orders that cross fill immediately at best opposing price
   * - Orders that don't cross return null (stay open)
   *
   * @param trade - LIMIT trade to simulate
   * @returns Fill simulation if order crosses spread, null if stays open
   */
  private async simulateLimitOrderFill(trade: Trade): Promise<FillSimulation | null> {
    if (!trade.price) {
      throw new ExecutionError(
        'LIMIT orders require a price',
        { details: { trade } }
      );
    }

    paperLogger.debug(
      {
        marketTokenId: trade.marketTokenId,
        side: trade.side,
        size: trade.size,
        limitPrice: trade.price,
      },
      'Simulating LIMIT order fill'
    );

    // Fetch order book for the market
    const orderBook = await this.adapter.getOrderBook(trade.marketTokenId);

    let fillPrice: number | null = null;

    if (trade.side === 'BUY') {
      // BUY LIMIT: Only fill if limit price >= best ask
      if (!orderBook.asks || orderBook.asks.length === 0) {
        throw new ExecutionError(
          `No asks available in order book for market ${trade.marketTokenId}. Cannot execute BUY LIMIT order.`,
          { details: { trade, marketTokenId: trade.marketTokenId } }
        );
      }

      const bestAsk = parseFloat(orderBook.asks[0].price);

      if (trade.price >= bestAsk) {
        // Order crosses spread - fill at best ask (favorable execution)
        fillPrice = bestAsk;
        paperLogger.info(
          { limitPrice: trade.price, bestAsk, fillPrice },
          'BUY LIMIT order crosses spread - filling at best ask'
        );
      } else {
        // Order does not cross - stays open
        paperLogger.info(
          { limitPrice: trade.price, bestAsk },
          'BUY LIMIT order does not cross spread - staying open'
        );
        return null;
      }
    } else {
      // SELL LIMIT: Only fill if limit price <= best bid
      if (!orderBook.bids || orderBook.bids.length === 0) {
        throw new ExecutionError(
          `No bids available in order book for market ${trade.marketTokenId}. Cannot execute SELL LIMIT order.`,
          { details: { trade, marketTokenId: trade.marketTokenId } }
        );
      }

      const bestBid = parseFloat(orderBook.bids[0].price);

      if (trade.price <= bestBid) {
        // Order crosses spread - fill at best bid (favorable execution)
        fillPrice = bestBid;
        paperLogger.info(
          { limitPrice: trade.price, bestBid, fillPrice },
          'SELL LIMIT order crosses spread - filling at best bid'
        );
      } else {
        // Order does not cross - stays open
        paperLogger.info(
          { limitPrice: trade.price, bestBid },
          'SELL LIMIT order does not cross spread - staying open'
        );
        return null;
      }
    }

    // Validate fill price
    if (fillPrice <= 0 || fillPrice >= 1) {
      throw new ExecutionError(
        `Invalid fill price ${fillPrice} for market ${trade.marketTokenId}. Price must be between 0 and 1.`,
        { details: { trade, fillPrice, marketTokenId: trade.marketTokenId } }
      );
    }

    // Validate SELL order position if filling
    if (trade.side === 'SELL') {
      const requiredQuantity = trade.size / fillPrice;
      const validation = await validateSellPosition(
        trade.marketTokenId,
        trade.outcome,
        'paper',
        requiredQuantity
      );

      if (!validation.valid) {
        throw new ExecutionError(
          validation.message || 'Insufficient position for SELL LIMIT order',
          {
            details: {
              trade,
              requiredQuantity,
              currentQuantity: validation.currentQuantity,
            }
          }
        );
      }
    }

    // Calculate quantity: tokens = size (USDC) / price
    const quantity = trade.size / fillPrice;

    const fillSimulation: FillSimulation = {
      fillPrice,
      quantity,
      executedAt: new Date(),
    };

    paperLogger.info(
      {
        marketTokenId: trade.marketTokenId,
        side: trade.side,
        limitPrice: trade.price,
        fillPrice,
        quantity,
      },
      'LIMIT order fill simulated'
    );

    return fillSimulation;
  }

  /**
   * Validate SELL order has sufficient position
   *
   * @param trade - SELL trade to validate
   * @throws ExecutionError if position is insufficient
   */
  private async validateSellOrder(trade: Trade): Promise<void> {
    paperLogger.debug(
      { marketTokenId: trade.marketTokenId, outcome: trade.outcome, size: trade.size },
      'Validating SELL order position'
    );

    // Get order book to calculate required quantity
    const orderBook = await this.adapter.getOrderBook(trade.marketTokenId);

    if (!orderBook.bids || orderBook.bids.length === 0) {
      throw new ExecutionError(
        `No bids available in order book for market ${trade.marketTokenId}. Cannot validate SELL order.`,
        { details: { trade, marketTokenId: trade.marketTokenId } }
      );
    }

    const expectedFillPrice = parseFloat(orderBook.bids[0].price);
    const requiredQuantity = trade.size / expectedFillPrice;

    paperLogger.debug(
      {
        marketTokenId: trade.marketTokenId,
        bestBid: expectedFillPrice,
        tradeSize: trade.size,
        calculatedRequiredQuantity: requiredQuantity,
        topBids: orderBook.bids.slice(0, 3).map(b => ({ price: b.price, size: b.size }))
      },
      'SELL order quantity calculation debug'
    );

    const validation = await validateSellPosition(
      trade.marketTokenId,
      trade.outcome,
      'paper',
      requiredQuantity
    );

    if (!validation.valid) {
      throw new ExecutionError(
        validation.message || 'Insufficient position for SELL order',
        {
          details: {
            trade,
            requiredQuantity,
            currentQuantity: validation.currentQuantity,
          }
        }
      );
    }

    paperLogger.debug(
      {
        marketTokenId: trade.marketTokenId,
        outcome: trade.outcome,
        requiredQuantity,
        currentQuantity: validation.currentQuantity,
      },
      'SELL order position validation passed'
    );
  }
}

/**
 * Singleton paper executor instance
 */
let paperExecutorInstance: PaperExecutor | null = null;

export function getPaperExecutor(): PaperExecutor {
  if (!paperExecutorInstance) {
    paperExecutorInstance = new PaperExecutor();
  }
  return paperExecutorInstance;
}
