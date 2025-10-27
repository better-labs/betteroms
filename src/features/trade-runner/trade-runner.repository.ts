import { eq } from 'drizzle-orm';
import { getDb } from '../../infrastructure/database/client.js';
import {
  executionHistory,
  type NewExecutionHistory,
  type ExecutionHistory,
} from '../../infrastructure/database/schema.js';
import { logger } from '../../infrastructure/logging/logger.js';

const repoLogger = logger.child({ module: 'trade-runner-repository' });

/**
 * Repository for trade runner operations
 * Manages execution_history table for idempotency and run tracking
 */
export class TradeRunnerRepository {
  /**
   * Check if a trade plan has already been executed (idempotency check)
   */
  async checkPlanExists(planId: string): Promise<boolean> {
    repoLogger.debug({ planId }, 'Checking if plan exists');

    const db = getDb();
    const result = await db
      .select()
      .from(executionHistory)
      .where(eq(executionHistory.planId, planId))
      .limit(1);

    const exists = result.length > 0;
    repoLogger.debug({ planId, exists }, 'Plan existence check complete');

    return exists;
  }

  /**
   * Get execution history record by planId
   */
  async getExecutionHistory(planId: string): Promise<ExecutionHistory | null> {
    repoLogger.debug({ planId }, 'Fetching execution history');

    const db = getDb();
    const result = await db
      .select()
      .from(executionHistory)
      .where(eq(executionHistory.planId, planId))
      .limit(1);

    if (result.length === 0) {
      repoLogger.debug({ planId }, 'No execution history found');
      return null;
    }

    repoLogger.debug({ planId }, 'Execution history fetched');
    return result[0];
  }

  /**
   * Create a new execution history record (start of run)
   */
  async createExecutionHistory(
    data: NewExecutionHistory
  ): Promise<ExecutionHistory> {
    repoLogger.debug({ planId: data.planId }, 'Creating execution history');

    const db = getDb();
    const [record] = await db
      .insert(executionHistory)
      .values(data)
      .returning();

    repoLogger.info({ planId: record.planId }, 'Execution history created');
    return record;
  }

  /**
   * Update execution history with completion status and summary
   */
  async completeExecutionHistory(
    planId: string,
    summaryJson: unknown,
    status: 'completed' | 'failed',
    errorMessage?: string
  ): Promise<void> {
    repoLogger.debug({ planId, status }, 'Completing execution history');

    const db = getDb();
    await db
      .update(executionHistory)
      .set({
        status,
        summaryJson,
        errorMessage: errorMessage || null,
        completedAt: new Date(),
      })
      .where(eq(executionHistory.planId, planId));

    repoLogger.info({ planId, status }, 'Execution history completed');
  }

  /**
   * Update execution history to failed status with error message
   */
  async failExecutionHistory(
    planId: string,
    errorMessage: string
  ): Promise<void> {
    repoLogger.warn({ planId, errorMessage }, 'Marking execution as failed');

    const db = getDb();
    await db
      .update(executionHistory)
      .set({
        status: 'failed',
        errorMessage,
        completedAt: new Date(),
      })
      .where(eq(executionHistory.planId, planId));

    repoLogger.info({ planId }, 'Execution history marked as failed');
  }
}

/**
 * Singleton repository instance
 */
let repositoryInstance: TradeRunnerRepository | null = null;

export function getTradeRunnerRepository(): TradeRunnerRepository {
  if (!repositoryInstance) {
    repositoryInstance = new TradeRunnerRepository();
  }
  return repositoryInstance;
}
