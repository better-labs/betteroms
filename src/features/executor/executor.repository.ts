import { eq, and } from 'drizzle-orm';
import { getDb } from '../../infrastructure/database/client.js';
import {
  orders,
  executions,
  type NewOrder,
  type NewExecution,
  type Order,
  type Execution,
} from '../../infrastructure/database/schema.js';
import { logger } from '../../infrastructure/logging/logger.js';
import type { Position } from './executor.types.js';

const repoLogger = logger.child({ module: 'executor-repository' });

/**
 * Repository for executor-related database operations
 * Handles orders, executions, and position calculations
 */
export class ExecutorRepository {
  /**
   * Create a new order record
   */
  async createOrder(orderData: NewOrder): Promise<Order> {
    repoLogger.debug({ orderData }, 'Creating order');

    const db = getDb();
    const [order] = await db.insert(orders).values(orderData).returning();

    repoLogger.info({ orderId: order.id, planId: order.planId }, 'Order created');
    return order;
  }

  /**
   * Create a new execution record
   */
  async createExecution(executionData: NewExecution): Promise<Execution> {
    repoLogger.debug({ executionData }, 'Creating execution');

    const db = getDb();
    const [execution] = await db
      .insert(executions)
      .values(executionData)
      .returning();

    repoLogger.info(
      { executionId: execution.id, orderId: execution.orderId },
      'Execution created'
    );
    return execution;
  }

  /**
   * Update order status
   */
  async updateOrderStatus(
    orderId: string,
    status: 'open' | 'filled' | 'partially_filled' | 'cancelled' | 'failed'
  ): Promise<void> {
    repoLogger.debug({ orderId, status }, 'Updating order status');

    const db = getDb();
    await db.update(orders).set({ status }).where(eq(orders.id, orderId));

    repoLogger.info({ orderId, status }, 'Order status updated');
  }

  /**
   * Get all orders for a plan
   */
  async getOrdersByPlanId(planId: string): Promise<Order[]> {
    repoLogger.debug({ planId }, 'Fetching orders for plan');

    const db = getDb();
    const planOrders = await db
      .select()
      .from(orders)
      .where(eq(orders.planId, planId));

    repoLogger.debug(
      { planId, orderCount: planOrders.length },
      'Orders fetched'
    );
    return planOrders;
  }

  /**
   * Get all executions for an order
   */
  async getExecutionsByOrderId(orderId: string): Promise<Execution[]> {
    repoLogger.debug({ orderId }, 'Fetching executions for order');

    const db = getDb();
    const orderExecutions = await db
      .select()
      .from(executions)
      .where(eq(executions.orderId, orderId));

    repoLogger.debug(
      { orderId, executionCount: orderExecutions.length },
      'Executions fetched'
    );
    return orderExecutions;
  }

  /**
   * Calculate position for a market token
   * Aggregates all executions to determine net position
   *
   * @param marketTokenId - Market token identifier
   * @param outcome - YES or NO
   * @param mode - paper or live
   * @returns Position with net quantity and average price
   */
  async calculatePosition(
    marketTokenId: string,
    outcome: 'YES' | 'NO',
    mode: 'paper' | 'live'
  ): Promise<Position | null> {
    repoLogger.debug({ marketTokenId, outcome, mode }, 'Calculating position');

    const db = getDb();

    // Join executions with orders to get side (BUY/SELL) information
    const result = await db
      .select({
        side: orders.side,
        quantity: executions.quantity,
        price: executions.price,
      })
      .from(executions)
      .innerJoin(orders, eq(orders.id, executions.orderId))
      .where(
        and(
          eq(orders.marketTokenId, marketTokenId),
          eq(orders.outcome, outcome),
          eq(orders.mode, mode)
        )
      );

    if (result.length === 0) {
      repoLogger.debug({ marketTokenId, outcome }, 'No position found');
      return null;
    }

    // Calculate net position and average price
    let buyQuantity = 0;
    let buyTotal = 0;
    let sellQuantity = 0;
    let sellTotal = 0;

    for (const row of result) {
      const quantity = parseFloat(row.quantity);
      const price = parseFloat(row.price);

      if (row.side === 'BUY') {
        buyQuantity += quantity;
        buyTotal += quantity * price;
      } else {
        sellQuantity += quantity;
        sellTotal += quantity * price;
      }
    }

    const netQuantity = buyQuantity - sellQuantity;

    // Calculate weighted average entry price for remaining position
    // For closed positions (netQuantity = 0), avgPrice is based on buy side
    const avgPrice = netQuantity !== 0
      ? (netQuantity > 0 ? buyTotal / buyQuantity : sellTotal / sellQuantity)
      : (buyQuantity > 0 ? buyTotal / buyQuantity : 0);

    // Calculate realized P&L from closed trades
    const closedQuantity = Math.min(buyQuantity, sellQuantity);
    const realizedPnL = closedQuantity > 0
      ? sellTotal - (buyTotal * (closedQuantity / buyQuantity))
      : 0;

    const position: Position = {
      marketTokenId,
      outcome,
      netQuantity,
      avgPrice,
      realizedPnL,
    };

    repoLogger.info({ position }, 'Position calculated');
    return position;
  }

  /**
   * Execute a trade within a transaction
   * Creates order and execution records atomically
   *
   * @param orderData - Order data to insert
   * @param executionData - Execution data to insert (without orderId)
   * @returns Created order and execution
   */
  async executeTradeTransaction(
    orderData: NewOrder,
    executionData: Omit<NewExecution, 'orderId'>
  ): Promise<{ order: Order; execution: Execution }> {
    repoLogger.debug({ orderData }, 'Starting trade execution transaction');

    const db = getDb();

    // Execute within transaction
    const result = await db.transaction(async (tx) => {
      // 1. Create order with 'open' status
      const [order] = await tx
        .insert(orders)
        .values({ ...orderData, status: 'open' })
        .returning();

      repoLogger.debug({ orderId: order.id }, 'Order created in transaction');

      // 2. Create execution linked to order
      const [execution] = await tx
        .insert(executions)
        .values({
          ...executionData,
          orderId: order.id,
        })
        .returning();

      repoLogger.debug(
        { executionId: execution.id },
        'Execution created in transaction'
      );

      // 3. Update order status to 'filled'
      await tx
        .update(orders)
        .set({ status: 'filled' })
        .where(eq(orders.id, order.id));

      repoLogger.debug({ orderId: order.id }, 'Order status updated to filled');

      return { order, execution };
    });

    repoLogger.info(
      { orderId: result.order.id, executionId: result.execution.id },
      'Trade execution transaction completed'
    );

    return result;
  }
}

/**
 * Singleton repository instance
 */
let repositoryInstance: ExecutorRepository | null = null;

export function getExecutorRepository(): ExecutorRepository {
  if (!repositoryInstance) {
    repositoryInstance = new ExecutorRepository();
  }
  return repositoryInstance;
}
