import { logger } from '../../infrastructure/logging/logger.js';
import { loadInput, parseJsonInput } from '../utils/input-loader.js';
import {
  formatSuccess,
  formatError,
  formatJson,
  printTradePlanSummary,
} from '../utils/output-formatter.js';

const commandLogger = logger.child({ module: 'trade-command' });

/**
 * Execute trade plan command handler
 *
 * Phase 3: Stub implementation - loads and displays trade plan
 * Phase 4: Will add validation
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
    const tradePlan = parseJsonInput(rawInput);
    commandLogger.debug({ tradePlan }, 'JSON parsed successfully');

    // Step 3: Basic structure check (not full validation - that's Phase 4)
    if (!isValidBasicStructure(tradePlan)) {
      throw new Error(
        'Invalid trade plan structure. Expected object with planId, mode, and trades fields.'
      );
    }

    // Step 4: Display trade plan summary (Phase 3 stub)
    console.log(''); // Blank line for readability
    printTradePlanSummary(tradePlan as any);
    console.log('');
    console.log('📄 Full trade plan:');
    console.log(formatJson(tradePlan));
    console.log('');

    // Phase 3: Just log success, no actual execution
    console.log(formatSuccess('Trade plan loaded and parsed successfully'));
    console.log('');
    console.log(
      'ℹ️  Phase 3: Validation and execution will be implemented in later phases.'
    );

    commandLogger.info({ planId: (tradePlan as any).planId }, 'Command completed successfully');

    // Exit with success
    process.exit(0);
  } catch (error) {
    // Handle errors gracefully
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

/**
 * Basic structure validation (Phase 3)
 * Full validation will be implemented in Phase 4
 */
function isValidBasicStructure(data: unknown): boolean {
  if (typeof data !== 'object' || data === null) {
    return false;
  }

  const obj = data as Record<string, unknown>;

  // Check for required top-level fields
  return (
    typeof obj.planId === 'string' &&
    (obj.mode === 'paper' || obj.mode === 'live') &&
    Array.isArray(obj.trades)
  );
}
