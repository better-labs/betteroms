/**
 * CLI output formatting utilities
 *
 * Provides consistent formatting for CLI output without external dependencies
 */

/**
 * Format success message
 */
export function formatSuccess(message: string): string {
  return `✅ ${message}`;
}

/**
 * Format error message
 */
export function formatError(message: string): string {
  return `❌ ${message}`;
}

/**
 * Format info message
 */
export function formatInfo(message: string): string {
  return `ℹ️  ${message}`;
}

/**
 * Format warning message
 */
export function formatWarning(message: string): string {
  return `⚠️  ${message}`;
}

/**
 * Format section header
 */
export function formatHeader(header: string): string {
  return `\n${'='.repeat(50)}\n${header}\n${'='.repeat(50)}`;
}

/**
 * Format key-value pair
 */
export function formatKeyValue(key: string, value: string | number): string {
  return `  ${key}: ${value}`;
}

/**
 * Format JSON for display
 */
export function formatJson(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

/**
 * Print trade plan summary
 */
export function printTradePlanSummary(plan: {
  planId: string;
  mode: string;
  trades: unknown[];
}): void {
  console.log(formatSuccess('Trade plan loaded'));
  console.log(formatKeyValue('Plan ID', plan.planId));
  console.log(formatKeyValue('Mode', plan.mode));
  console.log(formatKeyValue('Trades', plan.trades.length));
}
