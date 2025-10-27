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

const commandLogger = logger.child({ module: 'trade-command' });

/**
 * Execute trade plan command handler
 *
 * Phase 4: Validates trade plan against schema
 * Phase 5: Will add execution logic
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

    // Step 3: Validate against schema (Phase 4)
    const tradePlan = validateTradePlan(parsedJson);
    commandLogger.info(
      { planId: tradePlan.planId, mode: tradePlan.mode, tradeCount: tradePlan.trades.length },
      'Trade plan validated successfully'
    );

    // Step 4: Display trade plan summary
    console.log(''); // Blank line for readability
    printTradePlanSummary(tradePlan);
    console.log('');
    console.log('📄 Full trade plan:');
    console.log(formatJson(tradePlan));
    console.log('');

    // Phase 4: Just log success, no actual execution yet
    console.log(formatSuccess('Trade plan validated successfully'));
    console.log('');
    console.log('ℹ️  Phase 4: Trade execution will be implemented in Phase 5.');

    commandLogger.info({ planId: tradePlan.planId }, 'Command completed successfully');

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
