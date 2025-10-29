#!/usr/bin/env node
/**
 * BetterOMS CLI - Main entry point
 *
 * Command-line interface for BetterOMS order management system
 */

import { Command } from 'commander';
import { config } from 'dotenv';
import { executeTradePlan } from './commands/trade.command.js';

// Load environment variables from .env.local
config({ path: '.env.local' });

// Create CLI program
const program = new Command();

program
  .name('betteroms')
  .description('Order management system for Polymarket on Polygon')
  .version('0.1.0');

// Command: execute:trade-plan
program
  .command('execute:trade-plan')
  .description('Execute a trade plan in paper or live mode')
  .argument('[file-path]', 'Path to JSON trade plan file (optional if using stdin)')
  .option('-r, --reexecute', 'Skip idempotency check and allow re-execution of same planId')
  .action(async (filePath?: string, options?: { reexecute?: boolean }) => {
    await executeTradePlan(filePath, options?.reexecute);
  })
  .addHelpText(
    'after',
    `
Examples:
  $ pnpm run execute:trade-plan ./test/trade-plans/simple-buy.json
  $ pnpm run execute:trade-plan ./test/trade-plans/simple-buy.json --reexecute
  $ pnpm run execute:trade-plan ./test/trade-plans/simple-buy.json -r
  $ cat ./test/trade-plans/simple-buy.json | pnpm run execute:trade-plan
  $ pnpm run execute:trade-plan <<EOF
  {
    "planId": "test-001",
    "mode": "paper",
    "trades": [
      {
        "marketId": "0x123...",
        "outcome": "YES",
        "side": "BUY",
        "orderType": "MARKET",
        "size": 100
      }
    ]
  }
  EOF

Options:
  -r, --reexecute    Skip idempotency check and allow re-execution of same planId
                     Useful for testing and re-running the same trade plan multiple times

Input Methods:
  1. File path: Provide path to JSON file as argument
  2. Stdin (pipe): Pipe JSON content to command
  3. Stdin (heredoc): Use heredoc syntax to provide inline JSON

Trade Plan Format:
  {
    "planId": "unique-id",        // Unique identifier (prevents duplicate execution)
    "mode": "paper" | "live",     // Execution mode
    "trades": [                   // Array of trades to execute
      {
        "marketId": "...",        // Market/token ID or slug
        "outcome": "YES" | "NO",  // Market outcome
        "side": "BUY" | "SELL",   // Order side
        "orderType": "MARKET",    // Order type (LIMIT in Phase 7+)
        "size": 100               // Size in USDC collateral
      }
    ]
  }
`
  );

// Parse command line arguments
program.parse(process.argv);

// If no command provided, show help
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
