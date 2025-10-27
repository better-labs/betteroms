# BetterOMS System Tests

This directory contains end-to-end system tests for BetterOMS Phase 5 (Paper Trading Engine).

## Phase 5 Implementation Status

### ✅ Completed Components

1. **Paper Executor** ([paper-executor.ts](../src/features/executor/paper-executor.ts))
   - ✅ MARKET order fill simulation using real CLOB order book data
   - ✅ Zero slippage model (fills at best bid/ask)
   - ✅ SELL order position validation
   - ✅ Database persistence (transactional)
   - ✅ Error handling for invalid markets and insufficient positions

2. **Executor Service** ([executor.service.ts](../src/features/executor/executor.service.ts))
   - ✅ Routes trades to paper executor (live mode blocked in Phase 1)
   - ✅ Sequential trade execution (fail-fast on errors)
   - ✅ Structured logging

3. **Position Calculator** ([position-calculator.ts](../src/features/positions/position-calculator.ts))
   - ✅ On-the-fly position calculation from executions table
   - ✅ Net quantity and average price calculation
   - ✅ SELL position validation
   - ✅ Realized P&L calculation

4. **Executor Repository** ([executor.repository.ts](../src/features/executor/executor.repository.ts))
   - ✅ Transactional order + execution creation
   - ✅ Position aggregation queries
   - ✅ Order status management

5. **CLI Integration** ([trade.command.ts](../src/cli/commands/trade.command.ts))
   - ✅ Wired to executor service
   - ✅ Displays execution results
   - ✅ Error handling with formatted output

### ⚠️ Known Limitations (As Designed for Phase 1)

1. **LIMIT Orders Not Supported**: Only MARKET orders work in Phase 1
   - The `multi-trade.json` example includes a LIMIT order that will fail
   - Phase 7 will add LIMIT order support

2. **No Phase 6 Orchestration Yet**:
   - ❌ No idempotency check (duplicate planId prevention)
   - ❌ No execution_history table integration
   - ❌ No run summary generation
   - Phase 6 will add the trade-runner service

3. **Schema Mismatch**: Current schema still has `outcome` field
   - Trade plans have `outcome` field but Phase 5 design expects marketTokenId to encode outcome
   - This is acceptable for Phase 5 testing but should be cleaned up

## Test Market Token IDs

The test plans use this Polymarket market token:

- **Token ID**: `1848970600573335108085877783719034971837863729226932893148573876733882101789`
- **Market**: [You'll need to identify this from Polymarket API]
- **Outcome**: NO (as specified in test plans)

## Test Scenarios

### Test 1: Simple BUY Order (Basic Execution)

**Purpose**: Verify basic MARKET BUY order execution with order book simulation

**Command**:
```bash
pnpm run execute:trade-plan system-test/trade-plans/test-1-simple-buy.json
```

**Expected Result**:
- ✅ Order fetches order book from Polymarket CLOB
- ✅ Fills at best ask price
- ✅ Calculates quantity = size / fillPrice
- ✅ Creates order record (status: filled)
- ✅ Creates execution record with price/quantity
- ✅ Displays execution summary to stdout

**Exit Code**: 0 (success)

---

### Test 2: BUY Then SELL (Position Management)

**Purpose**: Verify position tracking and SELL validation

**Command**:
```bash
pnpm run execute:trade-plan system-test/trade-plans/test-2-buy-then-sell.json
```

**Expected Result**:
- ✅ First BUY order executes successfully
- ✅ Creates position in database
- ✅ Second SELL order validates position exists
- ✅ SELL order reduces position
- ✅ Both trades display in summary

**Exit Code**: 0 (success)

---

### Test 3: SELL Without Position (Validation Failure)

**Purpose**: Verify SELL validation rejects orders without existing position

**Command**:
```bash
pnpm run execute:trade-plan system-test/trade-plans/test-3-sell-no-position.json
```

**Expected Result**:
- ❌ SELL order validation fails
- ❌ Error message: "No existing position found for market token..."
- ❌ No orders created in database
- ❌ Transaction rollback

**Exit Code**: 1 (failure)

---

### Test 4: Invalid Market Token ID (API Failure)

**Purpose**: Verify graceful handling of invalid marketTokenId

**Command**:
```bash
pnpm run execute:trade-plan system-test/trade-plans/test-4-invalid-market.json
```

**Expected Result**:
- ❌ CLOB client returns error (market not found)
- ❌ ExecutionError thrown with details
- ❌ Error displayed to user with context
- ❌ No database records created

**Exit Code**: 1 (failure)

---

### Test 5: LIMIT Order (Phase 1 Limitation)

**Purpose**: Verify LIMIT orders are rejected in Phase 1

**Command**:
```bash
pnpm run execute:trade-plan system-test/trade-plans/multi-trade.json
```

**Expected Result**:
- ✅ First MARKET BUY order executes
- ❌ Second LIMIT SELL order fails with "Order type LIMIT not supported in Phase 1"
- ❌ Transaction fails (fail-fast)

**Exit Code**: 1 (failure on second trade)

---

## Creating Test Trade Plans

To create test trade plans, you'll need valid Polymarket market token IDs. Here's how to find them:

1. **Via CLOB Client Test Script**:
   ```bash
   pnpm run test:clob-client
   ```

2. **Via Polymarket API**: Browse markets at https://polymarket.com and inspect network requests

3. **Test Plan Template**:
   ```json
   {
     "planId": "test-unique-id",
     "mode": "paper",
     "notes": "Optional description",
     "trades": [
       {
         "marketTokenId": "VALID_TOKEN_ID_HERE",
         "outcome": "YES",
         "side": "BUY",
         "orderType": "MARKET",
         "size": 10
       }
     ]
   }
   ```

## Running Tests

### Prerequisites
- ✅ Database connection configured (`DATABASE_URL` in `.env.local`)
- ✅ Database migrations applied (`pnpm db:migrate`)
- ✅ Valid Polymarket market token IDs (market must be active)

### Manual Test Execution

```bash
# Test 1: Simple BUY
pnpm run execute:trade-plan system-test/trade-plans/test-1-simple-buy.json

# Test 2: BUY then SELL
pnpm run execute:trade-plan system-test/trade-plans/test-2-buy-then-sell.json

# Test 3: SELL without position (should fail)
pnpm run execute:trade-plan system-test/trade-plans/test-3-sell-no-position.json
```

### Verifying Results

**Database Inspection**:
```bash
# Open Drizzle Studio
pnpm db:studio

# Or query directly with psql
psql $DATABASE_URL -c "SELECT * FROM orders ORDER BY created_at DESC LIMIT 5;"
psql $DATABASE_URL -c "SELECT * FROM executions ORDER BY executed_at DESC LIMIT 5;"
```

**Log Output**:
- Check console for structured logs
- Look for execution summaries with fill prices and quantities
- Verify error messages are descriptive

## Troubleshooting

### "No bids/asks available in order book"
- Market may be inactive or have no liquidity
- Try a different market token ID
- Check market status on Polymarket.com

### "Database connection failed"
- Verify `DATABASE_URL` in `.env.local`
- Check database is running
- Run migrations: `pnpm db:migrate`

### "LIMIT order not supported"
- Expected behavior in Phase 1
- Use `orderType: "MARKET"` for now
- Phase 7 will add LIMIT support

## Next Steps (Phase 6)

Phase 6 will add:
- ✅ Trade runner orchestration service
- ✅ Idempotency checks (duplicate planId prevention)
- ✅ Run summary generation and persistence
- ✅ execution_history table integration
- ✅ Complete end-to-end testing

After Phase 6, re-running the same `planId` should fail with "Plan already executed" error.
