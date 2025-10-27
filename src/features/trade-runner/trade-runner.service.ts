import { getTradeRunnerRepository } from './trade-runner.repository.js';
import { getExecutorService } from '../executor/executor.service.js';
import { getExecutorRepository } from '../executor/executor.repository.js';
import { logger } from '../../infrastructure/logging/logger.js';
import { ExecutionError } from '../../domain/errors/execution.error.js';
import type { TradePlan } from '../../domain/schemas/trade-plan.schema.js';
import type { RunSummary, Position } from './trade-runner.types.js';

const runnerLogger = logger.child({ module: 'trade-runner-service' });

/**
 * Trade Runner Service
 *
 * Phase 6: Orchestration layer for trade plan execution
 * - Idempotency checks (prevents duplicate planId execution)
 * - Execution history tracking
 * - Run summary generation
 * - Position and P&L calculation
 */
export class TradeRunnerService {
  private repository = getTradeRunnerRepository();
  private executorService = getExecutorService();
  private executorRepository = getExecutorRepository();

  /**
   * Execute a trade plan with full orchestration
   *
   * @param plan - Trade plan to execute
   * @returns Run summary with positions and P&L
   */
  async executeTradePlan(plan: TradePlan): Promise<RunSummary> {
    const startedAt = new Date();

    runnerLogger.info(
      { planId: plan.planId, mode: plan.mode, tradeCount: plan.trades.length },
      'Starting trade plan execution'
    );

    // Step 1: Idempotency check
    const planExists = await this.repository.checkPlanExists(plan.planId);
    if (planExists) {
      const message = `Plan '${plan.planId}' has already been executed. Duplicate planId rejected for idempotency.`;
      runnerLogger.warn({ planId: plan.planId }, message);
      throw new ExecutionError(message, {
        details: { planId: plan.planId, reason: 'duplicate_plan_id' },
      });
    }

    // Step 2: Create execution history record (status: running)
    await this.repository.createExecutionHistory({
      planId: plan.planId,
      planJson: plan,
      status: 'running',
      startedAt,
    });

    runnerLogger.info({ planId: plan.planId }, 'Execution history created');

    try {
      // Step 3: Execute all trades via executor service
      const executionResults = await this.executorService.executeTradePlan(plan);

      runnerLogger.info(
        { planId: plan.planId, executedTrades: executionResults.length },
        'All trades executed successfully'
      );

      // Step 4: Calculate final positions and P&L
      const summary = await this.generateRunSummary(
        plan,
        startedAt,
        Date.now()
      );

      // Step 5: Update execution history (status: completed)
      await this.repository.completeExecutionHistory(
        plan.planId,
        summary,
        'completed'
      );

      runnerLogger.info(
        {
          planId: plan.planId,
          ordersPlaced: summary.ordersPlaced,
          ordersFilled: summary.ordersFilled,
          totalPnL: summary.totalPnL,
          durationMs: summary.durationMs,
        },
        'Trade plan execution completed successfully'
      );

      return summary;
    } catch (error) {
      // Error handling: mark execution as failed
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      runnerLogger.error(
        { planId: plan.planId, error: errorMessage },
        'Trade plan execution failed'
      );

      await this.repository.failExecutionHistory(plan.planId, errorMessage);

      // Re-throw error for caller to handle
      throw error;
    }
  }

  /**
   * Generate run summary from execution results
   *
   * Calculates positions and P&L across all executed trades
   */
  private async generateRunSummary(
    plan: TradePlan,
    startedAt: Date,
    endTimeMs: number
  ): Promise<RunSummary> {
    runnerLogger.debug({ planId: plan.planId }, 'Generating run summary');

    // Get all orders for this plan
    const orders = await this.executorRepository.getOrdersByPlanId(plan.planId);

    // Count order statuses
    const ordersFilled = orders.filter((o) => o.status === 'filled').length;
    const ordersPartiallyFilled = orders.filter(
      (o) => o.status === 'partially_filled'
    ).length;
    const ordersFailed = orders.filter((o) => o.status === 'failed').length;

    // Calculate positions for each unique market token + outcome
    const positionMap = new Map<string, Position>();
    let totalPnL = 0;

    for (const order of orders) {
      const key = `${order.marketTokenId}:${order.outcome}`;

      if (!positionMap.has(key)) {
        const position = await this.executorRepository.calculatePosition(
          order.marketTokenId,
          order.outcome as 'YES' | 'NO',
          plan.mode
        );

        if (position) {
          positionMap.set(key, {
            marketTokenId: position.marketTokenId,
            outcome: position.outcome,
            netQuantity: position.netQuantity,
            avgPrice: position.avgPrice,
            totalCost: position.netQuantity * position.avgPrice,
            realizedPnL: position.realizedPnL,
          });

          totalPnL += position.realizedPnL;
        }
      }
    }

    const positions = Array.from(positionMap.values());

    const summary: RunSummary = {
      planId: plan.planId,
      mode: plan.mode,
      ordersPlaced: orders.length,
      ordersFilled,
      ordersPartiallyFilled,
      ordersFailed,
      totalPnL,
      positions,
      startedAt,
      completedAt: new Date(endTimeMs),
      durationMs: endTimeMs - startedAt.getTime(),
    };

    runnerLogger.info(
      {
        planId: plan.planId,
        ordersPlaced: summary.ordersPlaced,
        ordersFilled: summary.ordersFilled,
        positionCount: positions.length,
        totalPnL: summary.totalPnL,
      },
      'Run summary generated'
    );

    return summary;
  }

  /**
   * Get execution history for a plan
   *
   * @param planId - Plan identifier
   * @returns Execution history record or null if not found
   */
  async getExecutionHistory(planId: string) {
    return await this.repository.getExecutionHistory(planId);
  }
}

/**
 * Singleton trade runner service instance
 */
let serviceInstance: TradeRunnerService | null = null;

export function getTradeRunnerService(): TradeRunnerService {
  if (!serviceInstance) {
    serviceInstance = new TradeRunnerService();
  }
  return serviceInstance;
}
