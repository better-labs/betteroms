import { logger } from '../../infrastructure/logging/logger.js';
import { loadInput, parseJsonInput } from '../utils/input-loader.js';
import {
  formatSuccess,
  formatError,
  formatJson,
  printTradePlanSummary,
} from '../utils/output-formatter.js';
import { validateTradePlan } from '../../domain/validators/trade-plan.validator.js';
import { ValidationError } from '../../domain/errors/validation.error.js';
import { ExecutionError } from '../../domain/errors/execution.error.js';
import { getTradeRunnerService } from '../../features/trade-runner/trade-runner.service.js';

const commandLogger = logger.child({ module: 'trade-command' });

/**
 * Execute trade plan command handler
 *
 * Phase 6: Validates and executes trade plans with full orchestration
 *
 * @param filePath - Optional path to trade plan JSON file
 */
export async function executeTradePlan(filePath?: string): Promise<void> {
  try {
    commandLogger.info({ filePath }, 'Starting trade plan execution');

    // Step 1: Load input (file or stdin)
    const rawInput = await loadInput(filePath);
    commandLogger.debug({ inputLength: rawInput.length }, 'Input loaded');

    // Step 2: Parse JSON
    const parsedJson = parseJsonInput(rawInput);
    commandLogger.debug('JSON parsed successfully');

    // Step 3: Validate against schema
    const tradePlan = validateTradePlan(parsedJson);
    commandLogger.info(
      { planId: tradePlan.planId, mode: tradePlan.mode, tradeCount: tradePlan.trades.length },
      'Trade plan validated successfully'
    );

    // Step 4: Display trade plan summary
    console.log(''); // Blank line for readability
    printTradePlanSummary(tradePlan);
    console.log('');

    // Step 5: Execute trades (Phase 6 - with orchestration)
    console.log('🚀 Executing trades...');
    console.log('');

    const tradeRunnerService = getTradeRunnerService();
    const runSummary = await tradeRunnerService.executeTradePlan(tradePlan);

    // Step 6: Display run summary
    console.log('');
    console.log(formatSuccess(`✓ Trade Plan '${runSummary.planId}' executed successfully`));
    console.log('');
    console.log('📊 Run Summary:');
    console.log('');
    console.log(`  Plan ID: ${runSummary.planId}`);
    console.log(`  Mode: ${runSummary.mode}`);
    console.log(`  Orders Placed: ${runSummary.ordersPlaced}`);
    console.log(`  Orders Filled: ${runSummary.ordersFilled}`);
    if (runSummary.ordersPartiallyFilled > 0) {
      console.log(`  Orders Partially Filled: ${runSummary.ordersPartiallyFilled}`);
    }
    if (runSummary.ordersFailed > 0) {
      console.log(`  Orders Failed: ${runSummary.ordersFailed}`);
    }
    console.log(`  Total P&L: ${runSummary.totalPnL >= 0 ? '+' : ''}$${runSummary.totalPnL.toFixed(2)}`);
    console.log(`  Duration: ${runSummary.durationMs}ms`);
    console.log('');

    if (runSummary.positions.length > 0) {
      console.log('📈 Positions:');
      console.log('');
      for (const position of runSummary.positions) {
        console.log(`  Market Token: ${position.marketTokenId}`);
        console.log(`  Outcome: ${position.outcome}`);
        console.log(`  Net Quantity: ${position.netQuantity.toFixed(2)} tokens`);
        console.log(`  Avg Price: ${position.avgPrice.toFixed(4)}`);
        console.log(`  Total Cost: $${position.totalCost.toFixed(2)}`);
        console.log(`  Realized P&L: ${position.realizedPnL >= 0 ? '+' : ''}$${position.realizedPnL.toFixed(2)}`);
        console.log('');
      }
    }

    if (runSummary.errors && runSummary.errors.length > 0) {
      console.log('⚠️  Errors:');
      console.log('');
      for (const error of runSummary.errors) {
        console.log(`  - ${error}`);
      }
      console.log('');
    }

    commandLogger.info(
      {
        planId: tradePlan.planId,
        ordersPlaced: runSummary.ordersPlaced,
        ordersFilled: runSummary.ordersFilled,
        totalPnL: runSummary.totalPnL,
      },
      'Command completed successfully'
    );

    // Exit with success
    process.exit(0);
  } catch (error) {
    // Handle validation errors with detailed messages
    if (error instanceof ValidationError) {
      console.error('');
      console.error(formatError('Trade plan validation failed'));
      console.error('');
      console.error(error.getSummary());
      console.error('');
      commandLogger.error({ validationErrors: error.validationErrors }, 'Validation failed');
      process.exit(1);
    }

    // Handle execution errors
    if (error instanceof ExecutionError) {
      console.error('');
      console.error(formatError('Trade execution failed'));
      console.error('');
      console.error(error.message);
      console.error('');
      if (error.details) {
        console.error('Details:');
        console.error(formatJson(error.details));
        console.error('');
      }
      commandLogger.error(
        { error: error.message, details: error.details },
        'Execution failed'
      );
      process.exit(1);
    }

    // Handle other errors
    if (error instanceof Error) {
      console.error('');
      console.error(formatError('Failed to execute trade plan'));
      console.error(error.message);
      console.error('');
      commandLogger.error({ error: error.message }, 'Command failed');
    } else {
      console.error('');
      console.error(formatError('Unknown error occurred'));
      console.error('');
      commandLogger.error({ error }, 'Command failed with unknown error');
    }

    // Exit with error
    process.exit(1);
  }
}
