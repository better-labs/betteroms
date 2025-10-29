# Phase 7: LIMIT Order Test Scenarios

This directory contains test scenarios for Phase 7 (LIMIT Order Support).

## Re-execution Flag

By default, BetterOMS prevents duplicate execution of the same `planId` for idempotency. To re-run the same trade plan multiple times (useful for testing), use the `--reexecute` or `-r` flag:

```bash
# Long form
pnpm run execute:trade-plan ./system-test/trade-plans/test-7-1-limit-buy-above-market.json --reexecute

# Short form
pnpm run execute:trade-plan ./system-test/trade-plans/test-7-1-limit-buy-above-market.json -r
```

When using `--reexecute`:
- Idempotency check is skipped
- A unique execution ID is generated (appends timestamp to planId)
- All orders are created with the original planId
- Execution history tracks each run separately
- Useful for testing and iterative development

## Test Overview

Phase 7 adds LIMIT order execution with order book crossing logic. LIMIT orders either fill immediately if they cross the spread, or stay open waiting for the market price to reach their limit price.

## Crossing Logic

**BUY LIMIT Orders:**
- Fills immediately if: `limit_price >= best_ask` (willing to pay more)
- Fills at: `best_ask` price (favorable execution)
- Stays open if: `limit_price < best_ask`

**SELL LIMIT Orders:**
- Fills immediately if: `limit_price <= best_bid` (willing to accept less)
- Fills at: `best_bid` price (favorable execution)
- Stays open if: `limit_price > best_bid`

## Test Scenarios

### Test 7-1: LIMIT BUY Above Market (Immediate Fill)
**File:** `test-7-1-limit-buy-above-market.json`

**Description:** BUY LIMIT order with price set high (0.95) to ensure it crosses the spread

**Expected Result:**
- Order fills immediately at best ask price
- Status: filled
- Fill price: best ask (likely much lower than 0.95)

**Command:**
```bash
pnpm run execute:trade-plan ./system-test/trade-plans/test-7-1-limit-buy-above-market.json

# To re-run the same test multiple times (for testing):
pnpm run execute:trade-plan ./system-test/trade-plans/test-7-1-limit-buy-above-market.json --reexecute
# or use the short flag:
pnpm run execute:trade-plan ./system-test/trade-plans/test-7-1-limit-buy-above-market.json -r
```

### Test 7-2: LIMIT BUY Below Market (Stays Open)
**File:** `test-7-2-limit-buy-below-market.json`

**Description:** BUY LIMIT order with price set low (0.01) to ensure it does NOT cross the spread

**Expected Result:**
- Order does NOT fill
- Status: open
- Listed in "Open Orders" section of output
- No execution record created

**Command:**
```bash
pnpm run execute:trade-plan ./system-test/trade-plans/test-7-2-limit-buy-below-market.json
```

### Test 7-3: LIMIT SELL Below Market (Immediate Fill)
**File:** `test-7-3-limit-sell-below-market.json`

**Description:** SELL LIMIT order with price set low (0.01) to ensure it crosses the spread

**Prerequisites:**
- Requires existing position from test-7-1
- Run test-7-1 first to establish position

**Expected Result:**
- Order fills immediately at best bid price
- Status: filled
- Position reduced by fill quantity

**Command:**
```bash
# Run test-7-1 first to create position
pnpm run execute:trade-plan ./system-test/trade-plans/test-7-1-limit-buy-above-market.json

# Then run test-7-3 to sell portion of position
pnpm run execute:trade-plan ./system-test/trade-plans/test-7-3-limit-sell-below-market.json
```

### Test 7-4: LIMIT SELL Above Market (Stays Open)
**File:** `test-7-4-limit-sell-above-market.json`

**Description:** SELL LIMIT order with price set high (0.99) to ensure it does NOT cross the spread

**Prerequisites:**
- Requires existing position from test-7-1

**Expected Result:**
- Order does NOT fill
- Status: open
- Listed in "Open Orders" section

**Command:**
```bash
# Ensure you have position from test-7-1
pnpm run execute:trade-plan ./system-test/trade-plans/test-7-4-limit-sell-above-market.json
```

### Test 7-5: Mixed Order Types
**File:** `test-7-5-mixed-order-types.json`

**Description:** Combines MARKET and LIMIT orders in single trade plan

**Contains:**
1. MARKET BUY (should fill immediately)
2. LIMIT SELL above market (should stay open)
3. LIMIT BUY (behavior depends on current market price)

**Expected Result:**
- Run summary shows mix of filled and open orders
- Demonstrates both order types working together

**Command:**
```bash
pnpm run execute:trade-plan ./system-test/trade-plans/test-7-5-mixed-order-types.json
```

## Validation Checklist

After running tests, verify:

- ✅ LIMIT orders that cross spread fill immediately at best opposing price
- ✅ LIMIT orders that don't cross create order record with `status: 'open'`
- ✅ No execution record created for unfilled LIMIT orders
- ✅ Run summary accurately reports "Orders Filled" vs "Orders Open"
- ✅ CLI displays "Open Orders" section with limit prices
- ✅ Position calculations exclude unfilled orders
- ✅ All existing MARKET order tests still pass

## Notes

**Phase 7 Scope:**
- LIMIT orders can be placed and will fill if price crosses spread
- Open LIMIT orders tracked in database but NOT actively managed
- No order cancellation/modification (Phase 10)
- No automated fill checking for open orders (requires Phase 8 scheduling)
- No order expiration/time-in-force

**Database State:**
- Open orders persist indefinitely until manually cancelled (future phase)
- Only filled orders contribute to positions and P&L
- Run summary clarifies: "Realized P&L from filled orders only"
