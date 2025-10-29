# Re-execution Flag: `--reexecute` / `-r`

## Overview

The `--reexecute` flag allows you to run the same trade plan multiple times, bypassing the idempotency check that normally prevents duplicate `planId` execution.

## Usage

```bash
# Long form
pnpm run execute:trade-plan ./path/to/trade-plan.json --reexecute

# Short form
pnpm run execute:trade-plan ./path/to/trade-plan.json -r
```

## Behavior

### Without `--reexecute` (Default)

```bash
# First execution - succeeds
$ pnpm run execute:trade-plan ./test-plan.json
✓ Trade Plan 'my-plan-001' executed successfully

# Second execution - fails with idempotency error
$ pnpm run execute:trade-plan ./test-plan.json
❌ Plan 'my-plan-001' has already been executed. Duplicate planId rejected for idempotency.
```

### With `--reexecute`

```bash
# First execution
$ pnpm run execute:trade-plan ./test-plan.json
✓ Trade Plan 'my-plan-001' executed successfully

# Second execution with --reexecute - succeeds
$ pnpm run execute:trade-plan ./test-plan.json --reexecute
⚠️  Re-execution mode: Skipping idempotency check
✓ Trade Plan 'my-plan-001' executed successfully
```

## Technical Details

When `--reexecute` is used:

1. **Idempotency Check Skipped**: The system does not check if the `planId` has been executed before
2. **Unique Execution ID**: A timestamp-based suffix is appended to create a unique execution history entry
   - Example: `my-plan-001-reexec-2025-10-29T18-15-00-976Z`
3. **Orders Use Original planId**: All created orders reference the original `planId` from the trade plan
4. **Separate Execution History**: Each re-execution creates a new entry in `execution_history` table
5. **Position Accumulation**: Subsequent executions add to existing positions (if filling same market/outcome)

## Use Cases

### 1. Testing and Development
```bash
# Rapidly test trade logic without changing planId each time
pnpm run execute:trade-plan ./test-limit-orders.json -r
pnpm run execute:trade-plan ./test-limit-orders.json -r
pnpm run execute:trade-plan ./test-limit-orders.json -r
```

### 2. Building Positions Incrementally
```bash
# Execute same trade plan multiple times to scale into position
pnpm run execute:trade-plan ./buy-100-usdc.json
pnpm run execute:trade-plan ./buy-100-usdc.json -r
pnpm run execute:trade-plan ./buy-100-usdc.json -r
# Result: 3x the position size
```

### 3. Iterative Strategy Testing
```bash
# Test a strategy multiple times with real market data snapshots
for i in {1..10}; do
  pnpm run execute:trade-plan ./strategy.json -r
  sleep 60  # Wait for market to change
done
```

### 4. Debugging and Analysis
```bash
# Re-run failed execution to debug issues
pnpm run execute:trade-plan ./problematic-plan.json -r
```

## Important Considerations

### Position Tracking
- Re-executions **DO** affect positions (fills add to existing positions)
- Re-executing BUY orders accumulates long positions
- Re-executing SELL orders requires sufficient position from prior executions

### Database Impact
- Each re-execution creates a new `execution_history` record
- Each re-execution creates new `orders` records (unique order IDs)
- Position calculations aggregate ALL orders for a given market/outcome/mode

### Production Use
- `--reexecute` is primarily for **testing and development**
- In production, prefer unique `planId` values for proper audit trail
- Consider the implications of bypassing idempotency protection

## Example Scenario

**Trade Plan:** `accumulate-position.json`
```json
{
  "planId": "accumulate-btc-yes-001",
  "mode": "paper",
  "trades": [
    {
      "marketTokenId": "...",
      "outcome": "YES",
      "side": "BUY",
      "orderType": "MARKET",
      "size": 50
    }
  ]
}
```

**Execution Sequence:**
```bash
# First execution (no flag needed)
$ pnpm run execute:trade-plan ./accumulate-position.json
✓ Orders Filled: 1
✓ Net Quantity: 50.25 tokens

# Re-execute to double position
$ pnpm run execute:trade-plan ./accumulate-position.json -r
⚠️  Re-execution mode: Skipping idempotency check
✓ Orders Filled: 1
✓ Net Quantity: 100.50 tokens  # Cumulative across both executions

# Re-execute again
$ pnpm run execute:trade-plan ./accumulate-position.json -r
✓ Net Quantity: 150.75 tokens  # Cumulative across all three executions
```

## Help

To see all available options:
```bash
pnpm run execute:trade-plan --help
```

Output:
```
Options:
  -r, --reexecute    Skip idempotency check and allow re-execution of same planId
                     Useful for testing and re-running the same trade plan multiple times
```

## Related Documentation

- [Phase 7 Test Scenarios](../system-test/trade-plans/README-PHASE-7.md) - Examples using `--reexecute`
- [Trade Plan Schema](./schemas/trade-plan-v0.0.7.schema.json) - Trade plan JSON format
- [Phase 6 Documentation](./design-betteroms-v1.md#phase-6) - Idempotency design
