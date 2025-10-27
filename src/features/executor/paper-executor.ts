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
      },
      'Starting paper trade execution'
    );

    try {
      // Step 1: Validate SELL orders have sufficient position
      if (trade.side === 'SELL') {
        await this.validateSellOrder(trade);
      }

      // Step 2: Simulate fill (only MARKET orders in Phase 1)
      if (trade.orderType !== 'MARKET') {
        throw new ExecutionError(
          `Order type ${trade.orderType} not supported in Phase 1. Only MARKET orders are supported.`,
          { details: { trade } }
        );
      }

      const fillSimulation = await this.simulateMarketOrderFill(trade);

      // Step 3: Persist order and execution to database (transactionally)
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
