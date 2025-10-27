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
import { getExecutorService } from '../../features/executor/executor.service.js';

const commandLogger = logger.child({ module: 'trade-command' });

/**
 * Execute trade plan command handler
 *
 * Phase 5: Validates and executes trade plans
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

    // Step 5: Execute trades (Phase 5)
    console.log('🚀 Executing trades...');
    console.log('');

    const executorService = getExecutorService();
    const results = await executorService.executeTradePlan(tradePlan);

    // Step 6: Display execution results
    console.log('');
    console.log(formatSuccess(`✓ All trades executed successfully (${results.length}/${tradePlan.trades.length})`));
    console.log('');
    console.log('📊 Execution Summary:');
    console.log('');

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const trade = result.trade;

      console.log(`Trade ${i + 1}:`);
      console.log(`  Market Token: ${trade.marketTokenId}`);
      console.log(`  ${trade.side} ${trade.outcome} @ ${trade.orderType}`);
      console.log(`  Size: $${trade.size} USDC`);
      console.log(`  Fill Price: ${result.fillPrice.toFixed(4)}`);
      console.log(`  Quantity: ${result.quantity.toFixed(2)} tokens`);
      console.log(`  Order ID: ${result.orderId}`);
      console.log(`  Status: ${result.status}`);
      console.log('');
    }

    commandLogger.info(
      { planId: tradePlan.planId, executedTrades: results.length },
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
