# BetterOMS System Tests

This directory contains end-to-end system tests for BetterOMS Phase 5 (Paper Trading Engine).

## Phase 6 Implementation Status

### ✅ Phase 6 Completed Components

1. **Trade Runner Service** ([trade-runner.service.ts](../src/features/trade-runner/trade-runner.service.ts))
   - ✅ Idempotency checks (prevents duplicate planId execution)
   - ✅ Execution history tracking
   - ✅ Run summary generation with P&L calculation
   - ✅ Error handling and rollback

2. **Trade Runner Repository** ([trade-runner.repository.ts](../src/features/trade-runner/trade-runner.repository.ts))
   - ✅ Execution history CRUD operations
   - ✅ Plan existence checks for idempotency
   - ✅ Run completion and failure tracking

3. **Enhanced Trade Plan Schema** (v0.0.7)
   - ✅ Trade-level notes field
   - ✅ Plan-level notes field

### ✅ Phase 5 Completed Components

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
   - Phase 7 will add LIMIT order support

2. **Schema Design**: Current schema has explicit `outcome` field
   - Trade plans have `outcome` field which is the intended design
   - marketTokenId is the ERC1155 token ID for the specific outcome

## Test Market Token IDs

The test plans use this Polymarket market token:

- **Token ID**: `1848970600573335108085877783719034971837863729226932893148573876733882101789`
- **Market**: [You'll need to identify this from Polymarket API]
- **Outcome**: NO (as specified in test plans)

## Test Scenarios

---

## Phase 6 Tests: Orchestration & Idempotency

### Test 6-1: First Execution (Idempotency - Success)

**Purpose**: Verify that a new planId executes successfully and creates execution history

**Command**:
```bash
pnpm run execute:trade-plan system-test/trade-plans/test-6-1-first-execution.json
```

**Expected Result**:
- ✅ Idempotency check passes (plan does not exist)
- ✅ Execution history record created with status: 'running'
- ✅ Trade executes successfully
- ✅ Run summary generated with positions and P&L
- ✅ Execution history updated to status: 'completed'
- ✅ Summary includes:
  - planId, mode, ordersPlaced, ordersFilled
  - Position details (marketTokenId, outcome, netQuantity, avgPrice)
  - Total realized P&L
  - Duration in milliseconds

**Exit Code**: 0 (success)

**Verify in Database**:
```bash
psql $DATABASE_URL -c "SELECT plan_id, status, started_at, completed_at FROM execution_history WHERE plan_id = 'phase6-test-001';"
```

---

### Test 6-2: Duplicate PlanId (Idempotency - Rejection)

**Purpose**: Verify that duplicate planId is rejected for idempotency

**Prerequisites**: Run Test 6-1 first

**Command**:
```bash
pnpm run execute:trade-plan system-test/trade-plans/test-6-2-idempotency-duplicate.json
```

**Expected Result**:
- ❌ Idempotency check fails (plan already exists)
- ❌ Error message: "Plan 'phase6-test-001' has already been executed. Duplicate planId rejected for idempotency."
- ❌ No new orders created
- ❌ Execution history NOT updated (original record remains unchanged)

**Exit Code**: 1 (failure)

**Verify in Database**:
```bash
psql $DATABASE_URL -c "SELECT COUNT(*) FROM execution_history WHERE plan_id = 'phase6-test-001';"
# Should return 1 (only the original execution)
```

---

### Test 6-3: BUY then SELL (P&L Calculation)

**Purpose**: Verify position tracking and P&L calculation with BUY + SELL

**Command**:
```bash
pnpm run execute:trade-plan system-test/trade-plans/test-6-3-buy-sell-pnl.json
```

**Expected Result**:
- ✅ First BUY order executes ($50 USDC)
- ✅ Second SELL order executes ($30 USDC)
- ✅ Run summary shows:
  - 2 orders placed, 2 orders filled
  - Final position: net quantity = (BUY quantity - SELL quantity)
  - Realized P&L calculated from the partial position close
  - Position shows avgPrice and totalCost
- ✅ Execution history persisted with summary_json

**Exit Code**: 0 (success)

**Example Output**:
```
📊 Run Summary:
  Plan ID: phase6-test-pnl-calc
  Mode: paper
  Orders Placed: 2
  Orders Filled: 2
  Total P&L: +$X.XX  (or -$X.XX depending on price movement)
  Duration: XXXms

📈 Positions:
  Market Token: 1848970600573335108085877783719034971837863729226932893148573876733882101789
  Outcome: NO
  Net Quantity: XX.XX tokens (remaining after sell)
  Avg Price: 0.XXXX
  Total Cost: $XX.XX
  Realized P&L: +$X.XX
```

---

### Test 6-4: Complete Close (Full Cycle)

**Purpose**: Verify complete position close results in zero net quantity and full P&L realization

**Command**:
```bash
pnpm run execute:trade-plan system-test/trade-plans/test-6-4-complete-close.json
```

**Expected Result**:
- ✅ BUY order executes ($20 USDC)
- ✅ SELL order executes (same $20 USDC worth)
- ✅ Run summary shows:
  - Net quantity ≈ 0 (or very close due to price differences)
  - Full P&L realized (all position closed)
  - avgPrice reflects the weighted average entry price

**Exit Code**: 0 (success)

**Database Verification**:
```bash
psql $DATABASE_URL -c "SELECT plan_id, status, summary_json->>'totalPnL' as total_pnl FROM execution_history WHERE plan_id = 'phase6-test-full-cycle';"
```

---

## Phase 5 Tests: Trade Execution

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

## Phase 6 Complete!

Phase 6 has been fully implemented:
- ✅ Trade runner orchestration service
- ✅ Idempotency checks (duplicate planId prevention)
- ✅ Run summary generation and persistence
- ✅ execution_history table integration
- ✅ Complete end-to-end testing
- ✅ Position and P&L calculation across trades

Re-running the same `planId` will now fail with "Plan already executed" error (see Test 6-2).

## Next Steps (Phase 7+)

Future phases will add:
- **Phase 7**: LIMIT order support with order book crossing logic
- **Phase 8**: Automated scheduling (hourly cron via Vercel)
- **Phase 9**: Live trading mode with wallet integration
- **Phase 10**: Order cancellation and modification
