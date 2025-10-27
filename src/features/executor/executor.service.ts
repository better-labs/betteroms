import { getPaperExecutor } from './paper-executor.js';
import { logger } from '../../infrastructure/logging/logger.js';
import { ExecutionError } from '../../domain/errors/execution.error.js';
import type { TradePlan, Trade } from '../../domain/schemas/trade-plan.schema.js';
import type { ExecutionResult } from './executor.types.js';

const executorLogger = logger.child({ module: 'executor-service' });

/**
 * Executor Service
 *
 * Routes trade execution to appropriate executor (paper vs live).
 * Phase 1: Paper mode only.
 * Phase 3+: Will add live trading mode.
 */
export class ExecutorService {
  private paperExecutor = getPaperExecutor();

  /**
   * Execute all trades in a trade plan
   *
   * @param tradePlan - Complete trade plan to execute
   * @returns Array of execution results
   */
  async executeTradePlan(tradePlan: TradePlan): Promise<ExecutionResult[]> {
    executorLogger.info(
      {
        planId: tradePlan.planId,
        mode: tradePlan.mode,
        tradeCount: tradePlan.trades.length,
      },
      'Starting trade plan execution'
    );

    // Phase 1: Only paper mode is supported
    if (tradePlan.mode === 'live') {
      throw new ExecutionError(
        'Live trading mode is not supported in Phase 1. Please use "paper" mode.',
        { details: { planId: tradePlan.planId, mode: tradePlan.mode } }
      );
    }

    const results: ExecutionResult[] = [];

    // Execute trades sequentially
    // Phase 1: Fail-fast on first error
    for (let i = 0; i < tradePlan.trades.length; i++) {
      const trade = tradePlan.trades[i];

      executorLogger.info(
        {
          planId: tradePlan.planId,
          tradeIndex: i + 1,
          totalTrades: tradePlan.trades.length,
          trade,
        },
        'Executing trade'
      );

      try {
        const result = await this.executeTrade(
          tradePlan.planId,
          trade,
          tradePlan.mode
        );

        results.push(result);

        executorLogger.info(
          {
            planId: tradePlan.planId,
            tradeIndex: i + 1,
            orderId: result.orderId,
            status: result.status,
          },
          'Trade executed successfully'
        );
      } catch (error) {
        executorLogger.error(
          {
            planId: tradePlan.planId,
            tradeIndex: i + 1,
            trade,
            error: error instanceof Error ? error.message : String(error),
          },
          'Trade execution failed'
        );

        // Fail-fast: stop on first error
        throw error;
      }
    }

    executorLogger.info(
      {
        planId: tradePlan.planId,
        successfulTrades: results.length,
        totalTrades: tradePlan.trades.length,
      },
      'Trade plan execution completed'
    );

    return results;
  }

  /**
   * Execute a single trade
   *
   * Routes to appropriate executor based on mode.
   *
   * @param planId - Trade plan identifier
   * @param trade - Trade to execute
   * @param mode - Execution mode (paper or live)
   * @returns Execution result
   */
  async executeTrade(
    planId: string,
    trade: Trade,
    mode: 'paper' | 'live'
  ): Promise<ExecutionResult> {
    executorLogger.debug(
      { planId, trade, mode },
      'Routing trade to executor'
    );

    if (mode === 'paper') {
      return await this.paperExecutor.executeTrade(planId, trade);
    }

    // Phase 3+: Add live executor
    throw new ExecutionError(
      'Live trading mode is not supported in Phase 1. Please use "paper" mode.',
      { details: { planId, trade, mode } }
    );
  }
}

/**
 * Singleton executor service instance
 */
let executorServiceInstance: ExecutorService | null = null;

export function getExecutorService(): ExecutorService {
  if (!executorServiceInstance) {
    executorServiceInstance = new ExecutorService();
  }
  return executorServiceInstance;
}
