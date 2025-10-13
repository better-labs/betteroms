# BetterOMS — Single‑User Order Management System for Polymarket (Polygon)

(as of 9/29)

## TL;DR
A single‑user, batch‑executed trading orchestration tool for Polymarket on Polygon. To be used for both live trading and paper trading (for benchmark purposes).It accepts JSON trade plans (with a **paper vs. live** toggle), runs on an hourly cron, and executes/updates/cancels orders via Polymarket APIs.

Future phases add price triggers, expirations, and (optional) delegated smart‑contract signing to avoid handling raw private keys.

---

## Scope & Goals
- **User**: one operator (you).
- **Exchanges**: **Polymarket** (Polygon).
- **Order types**: YES/NO outcome orders via **limit** orders (bid/ask); marketable limit supported by setting price to cross the spread.
- **Modes**: **paper** (simulate) and **live** (on‑chain via Polymarket APIs).
- **Cadence**: Phase 1 manual CLI; later phases add hourly cron.
- **Latency sensitivity**: low; no HFT ambitions.
- **Out of scope (initial)**: multi‑user, cross‑venue routing, HFT/real‑time websockets, portfolio margining.

### Non‑Goals (for Phase 1)
- Real‑time reactive strategies, co‑location, sub‑second triggers.
- Fancy UI (CLI/JSON first; optional dashboard later).

---

## User Stories (Phase 1)

### US-0: Configure Account Credentials
**As a** trader
**I want to** configure my Polymarket credentials with BetterOMS
**So that** the system can fetch market data and (in future phases) execute live trades

**Acceptance Criteria:**
- System provides clear documentation on obtaining Polymarket credentials
- User exports private key from Polymarket.com:
  1. Log into Polymarket.com
  2. Click 'Cash' → 3 dots → 'Export Private Key'
  3. Save private key (remove '0x' prefix if present)
- User creates `.env.local` file in project root with credentials:
  ```
  POLYMARKET_PRIVATE_KEY=your_private_key_here
  POLYMARKET_API_KEY=your_api_key_here
  POLYMARKET_API_SECRET=your_api_secret_here
  POLYMARKET_API_PASSPHRASE=your_passphrase_here
  ```
- System validates `.env.local` exists and contains required variables on startup
- Private key is NEVER logged or displayed in output
- `.env.local` file is git-ignored by default (in `.gitignore`)

**Phase 1 Note:**
- API credentials are optional in Phase 1 (paper mode)
- Paper mode can use public market data endpoints (no authentication required)
- Live trading (Phase 3) will require full API credentials

**Security Considerations:**
- Private key grants full access to wallet funds - treat as highly sensitive
- API credentials are deterministically derived from private key signature
- Future Phase 5: Implement delegated signer contract to avoid handling private keys
- Recommend: Use dedicated trading wallet with limited funds for initial testing

---

### US-1: Submit Paper Trade Plan
**As a** trader
**I want to** submit a JSON trade plan in paper mode
**So that** I can simulate trades without risking real capital

**Acceptance Criteria:**
- CLI command accepts file path: `pnpm run trade ./plans/test.json`
- JSON validated against Phase 1 schema (planId, mode, tradeInstructions array)
- Orders persisted to `orders` table with status 'pending'
- Run record created in `runs` table

### US-2: Simulate Order Fill
**As a** trader
**I want to** see my limit buy order fill when the market price drops below my limit
**So that** I can validate my trading strategy works as expected

**Acceptance Criteria:**
- System fetches current order book for market
- If limit price crosses best opposing price, order fills immediately
- Execution record created in `executions` table
- Order status updated to 'filled'

### US-3: Track Simulated Position
**As a** trader
**I want to** see my current position and P&L for a market
**So that** I understand my exposure and profitability

**Acceptance Criteria:**
- System calculates position from executions table
- Shows: market_id, outcome, net quantity, average entry price
- Displays unrealized P&L based on current market price

### US-4: Prevent Duplicate Runs
**As a** trader
**I want to** prevent accidentally running the same trade plan twice
**So that** I don't double my intended position

**Acceptance Criteria:**
- System checks if `planId` already exists in `runs` table
- If duplicate detected, reject with clear error message
- If new planId, proceed with execution

### US-5: View Run Summary
**As a** trader
**I want to** see a summary of what happened during my trade run
**So that** I can verify orders were placed correctly

**Acceptance Criteria:**
- After run completes, display summary to stdout
- Summary includes: orders placed, orders filled, total P&L
- Summary also persisted to `runs.summary_json`

---

## Test Scenarios (Phase 1)

### Scenario 1: Order Doesn't Fill (Limit Too Aggressive)
```
Given market best ask is 0.50
When I submit paper BUY order at 0.40
Then order should be created with status 'open'
And no execution should be recorded
```

### Scenario 2: Order Fills Immediately (Limit Crosses Spread)
```
Given market best ask is 0.45
When I submit paper BUY order at 0.50
Then order should fill at 0.45 (best available price)
And execution recorded with qty=size, price=0.45
And order status updated to 'filled'
```

### Scenario 3: Idempotency Check
```
Given I've run plan with planId "test-001"
When I try to run same plan with planId "test-001" again
Then system should reject with error "planId already exists"
And no new orders should be created
```

### Scenario 4: Position Calculation
```
Given I have executed:
  - BUY 100 YES @ 0.40
  - BUY 50 YES @ 0.50
When I query my position
Then I should see:
  - Net quantity: 150 YES
  - Average price: 0.433 (weighted avg)
```

### Scenario 5: Invalid JSON Rejected
```
Given JSON plan missing required field "marketId"
When I submit the plan
Then system should reject with Zod validation error
And no orders or run records should be created
```

---

## High‑Level Architecture
```
+----------------+       +----------------+       +--------------------+
| JSON Trade Plan| --->  | Batch Runner   | --->  | Paper Engine (sim) |
+----------------+       | (Cron/Serverless)      +--------------------+
                         |    ^     |             +--------------------+
                         |    |     +-----------> | Polymarket Adapter |
                         |    |                   | (real trades)      |
                         v    |                   +--------------------+
                    +----------------+
                    | State Store DB |
                    +----------------+
```
- **Batch Runner**: Invoked hourly; parses input plans, decides paper vs. live, and calls the appropriate executor.
- **Polymarket Adapter**: Thin service wrapping REST/WebSocket endpoints for markets, order placement, cancel, status.
- **Paper Engine**: Deterministic simulator using latest order book snapshots to emulate fills/slippage.
- **State Store**: Orders, positions, executions, PnL, audit logs.

---

## Suggested Tech Choices
- **Runtime**: Node.js (TypeScript).
- **Job runner**: Vercel serverless functions (Vercel Cron for automation in later phases).
- **DB**: Postgres from day 1 (Vercel Postgres, Neon, or Supabase).
  - **Local dev**: Docker Compose with Postgres container.
  - **Production**: Same connection string, deployed to Vercel.
  - **Why Postgres-first**: Vercel/serverless platforms don't support SQLite (no persistent filesystem).
- **Key mgmt (Phase 1-5)**: env‑scoped private key in secure secret store (**only if you must**).
- **Key mgmt (Phase 6+)**: **Delegated smart‑contract executor** on Polygon with revocable allowances (see Security).

---

## Project Layout (TypeScript)
```
/src
  /adapters
    polymarketClient.ts        // REST/WS calls, auth, retries
  /core
    executor.ts                // routes to paper vs live
    paperEngine.ts             // fill simulation
    liveEngine.ts              // on-chain execution via adapter
    risk.ts                    // caps, notional limits, sanity checks
  /domain
    types.ts                   // Order, Market, Position, enums
    validation.ts              // zod schemas for inputs
  /io
    inputLoader.ts             // Phase 1: load JSON from file path only
    logger.ts                  // structured logging
  /persistence
    db.ts                      // Drizzle client (Postgres)
    schema.ts                  // Drizzle table schemas
    repositories.ts            // Orders/Executions/Runs repos
  /rules
    timeExpiry.ts              // cancel-after, good-til time
    priceTriggers.ts           // simple stop/take-profit (phase 2)
  /utils
    math.ts                    // odds/price conversions
    clock.ts                   // time helpers
/scripts
  generate-credentials.ts      // EOA signup: pnpm run generate-creds
  set-allowances.ts            // Phase 3+: pnpm run set-allowances
/index.ts                      // CLI entry point: pnpm run trade <file>
/package.json                  // scripts: generate-creds, trade, dev, db:*
/.env.local                    // git-ignored secrets (never commit!)
/.gitignore                    // must include .env.local
/docker-compose.yml            // local Postgres for development
```

**Key Dependencies (Phase 1):**
```json
{
  "dependencies": {
    "@polymarket/clob-client": "^latest",
    "ethers": "^6.x",
    "drizzle-orm": "^latest",
    "postgres": "^latest",
    "zod": "^latest",
    "dotenv": "^latest"
  },
  "scripts": {
    "generate-creds": "tsx scripts/generate-credentials.ts",
    "set-allowances": "tsx scripts/set-allowances.ts",
    "trade": "tsx index.ts",
    "dev": "tsx watch index.ts",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:studio": "drizzle-kit studio"
  }
}
```

**Note on `set-allowances` script:**
- Phase 3+ only (live trading)
- Approves USDC and CTF tokens to Polymarket exchange
- One-time setup per wallet
- Not needed for Phase 1 paper trading

Pros:
- Clear seams (adapter/core/domain) => easy to test & swap (paper vs live).
- Rules isolated for incremental feature add.
- Scripts directory for CLI utilities (generate-creds, future: market-lookup, etc.)

---


## Phase Task Plan

This section consolidates deliverables, constraints, and success criteria for each development phase.

---

## Paper Trading Engine (Phase 1-2)
- Pull latest **order book snapshot** / last trade for each market at batch time.
- Fill logic:
  1. If limit price **crosses or equals** opposing best, assume immediate fill up to available size (cap to configured liquidity assumption).
  2. Otherwise, leave as **resting order** in simulated book until a future run where crossing occurs (based on new snapshot).
- Slippage model: simple (best + tick); configurable spread cushion.
- Record simulated executions and positions identically to live mode.

*Note*: Deterministic by seeding with `planId` + marketId for repeatable tests.

---

## Live Trading Flow (Phase 3+)
1. **Discover** market + outcome tokens (via Polymarket API).
2. **Pre‑trade checks**: wallet balance, approvals (USDC & outcome tokens if needed), venue status.
3. **Place order**: limit BUY/SELL at specified price/size.
4. **Track**: poll order status next batch; cancel if past `cancelAfterSec`.
5. **Reconcile**: update fills → positions → PnL.

> Implementation detail will depend on Polymarket’s current REST/WS endpoints for markets, order placement, order status, and cancel. Wrap all calls in `adapters/polymarketClient.ts` with strong typing and retries.

---

## Batch Scheduling

### Phase 1 (File-Based)
- **Invocation**: Manual command-line execution via `pnpm run trade <file-path>`
- **Input**: Single JSON trade plan file specified as CLI argument
  - Example: `pnpm run trade ./plans/my-trade.json`
  - No S3, database, or multi-file loading in Phase 1
- **Execution flow**:
  - Load and validate JSON plan from specified file path
  - Execute trades (paper or live mode)
  - Emit run report (JSON + human log)

### Phase 2+ (Automated Scheduling)
- **Default**: every **60 min** (env `CRON_INTERVAL_MINUTES`) via cron or serverless scheduler
- On each run:
  - Load active JSON trade plans (filesystem directory scan, S3, or DB).
  - For each plan: validate → risk checks → execute (paper or live).
  - Run **maintenance**: cancel‑after, stale order cleanup, sync positions.
  - Emit a run report (JSON + human log).

---

## Persistence

BetterOMS uses Postgres from day 1 with Drizzle ORM (Vercel Postgres, Neon, or Supabase). Schema evolves by phase.

### Core Tables (All Phases)

#### orders
Tracks all order lifecycle from submission to completion.

```sql
CREATE TABLE orders (
  id UUID PRIMARY KEY,
  plan_id VARCHAR(255) NOT NULL,
  market_id VARCHAR(255) NOT NULL,
  outcome VARCHAR(10) NOT NULL,      -- 'YES' | 'NO'
  side VARCHAR(10) NOT NULL,         -- 'BUY' | 'SELL'
  price DECIMAL(10,4) NOT NULL,      -- 0.0000 to 1.0000
  size DECIMAL(18,6) NOT NULL,       -- USDC amount (Phase 1) or token qty (Phase 2+)
  mode VARCHAR(10) NOT NULL,         -- 'paper' | 'live'
  status VARCHAR(20) NOT NULL,       -- 'pending' | 'open' | 'filled' | 'cancelled'

  -- Phase 1 fields
  placed_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),

  -- Phase 2+ fields (nullable in Phase 1)
  cancel_after TIMESTAMP,            -- GTT expiration time
  price_ceil DECIMAL(10,4),          -- Phase 5: max buy price guard
  price_floor DECIMAL(10,4),         -- Phase 5: min sell price guard
  notes TEXT,                        -- Phase 2: user notes
  time_in_force VARCHAR(10),         -- Phase 4: GTC, GTD, FOK, FAK
  external_order_id VARCHAR(255)     -- Phase 3: Polymarket order ID
);

CREATE INDEX idx_orders_plan_id ON orders(plan_id);
CREATE INDEX idx_orders_market_status ON orders(market_id, status);
CREATE INDEX idx_orders_cancel_after ON orders(cancel_after) WHERE cancel_after IS NOT NULL; -- Phase 2+
```

#### executions
Records all fills (partial or complete) for order tracking and P&L calculation.

```sql
CREATE TABLE executions (
  id UUID PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES orders(id),
  qty DECIMAL(18,6) NOT NULL,        -- filled quantity
  price DECIMAL(10,4) NOT NULL,      -- actual fill price
  mode VARCHAR(10) NOT NULL,         -- 'paper' | 'live'
  executed_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),

  -- Phase 3+ fields (nullable in Phase 1)
  external_execution_id VARCHAR(255) -- Polymarket fill ID
);

CREATE INDEX idx_executions_order_id ON executions(order_id);
CREATE INDEX idx_executions_executed_at ON executions(executed_at);
```

#### runs
Execution history and run-level summaries.

```sql
CREATE TABLE runs (
  plan_id VARCHAR(255) PRIMARY KEY,  -- Idempotency key
  started_at TIMESTAMP NOT NULL,
  completed_at TIMESTAMP,
  status VARCHAR(20) NOT NULL,       -- 'running' | 'completed' | 'failed'
  plan_file VARCHAR(500),            -- Path or S3 key to input JSON
  summary_json JSONB,                -- Run results summary
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_runs_status ON runs(status);
CREATE INDEX idx_runs_started_at ON runs(started_at);
```

### Phase-Specific Tables

#### positions (Phase 2+)
Pre-computed position tracking for performance. Phase 1 calculates on-the-fly from executions.

```sql
CREATE TABLE positions (
  id UUID PRIMARY KEY,
  market_id VARCHAR(255) NOT NULL,
  outcome VARCHAR(10) NOT NULL,      -- 'YES' | 'NO'
  mode VARCHAR(10) NOT NULL,         -- 'paper' | 'live'

  -- Position state
  qty DECIMAL(18,6) NOT NULL,        -- Net quantity (positive = long, negative = short)
  avg_price DECIMAL(10,4) NOT NULL,  -- Weighted average entry price
  realized_pnl DECIMAL(18,6) DEFAULT 0,

  -- Metadata
  updated_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(market_id, outcome, mode)
);

CREATE INDEX idx_positions_market ON positions(market_id);
```

#### audit_logs (Phase 2+)
Structured event tracking for debugging and compliance.

```sql
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY,
  event_type VARCHAR(50) NOT NULL,   -- 'order_placed', 'order_filled', 'run_started', etc.
  entity_type VARCHAR(50) NOT NULL,  -- 'order', 'execution', 'run', 'position'
  entity_id VARCHAR(255) NOT NULL,

  -- Event details
  event_data JSONB,                  -- Flexible event payload
  actor VARCHAR(100),                -- System component or user

  -- Metadata
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_logs_event_type ON audit_logs(event_type);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);
```

### Schema Evolution by Phase

**Phase 1**: Core 3 tables only
- `orders` (basic fields)
- `executions` (basic fields)
- `runs`
- Positions calculated on-the-fly
- Logging to stdout

**Phase 2**: Add performance tables
- `positions` table for pre-computed state
- `audit_logs` for structured events
- Add `cancel_after`, `notes` to orders

**Phase 3**: Add live trading fields
- `external_order_id` on orders
- `external_execution_id` on executions

**Phase 4**: Add market-making support
- `time_in_force` on orders (GTC, GTD, FOK, FAK)
- Track open orders per market for quote management

**Phase 5**: Add risk controls
- `price_ceil`, `price_floor` on orders

### Migration Strategy
- Use Drizzle Kit for schema migrations
- All Phase 2+ fields are nullable to support incremental rollout
- Backwards compatible: Phase 1 code works with Phase 2+ schema

---

## Security Model
- **Phase 1-5**: If using a private key, store in a dedicated secrets manager; never log it; restrict wallet to minimal funds.
- **Phase 6+ (preferred)**: Deploy a **Delegate Executor** contract on Polygon:
  - User submits **Approve** transactions for USDC/outcome tokens with **spend limits** to the executor.
  - Executor enforces **allow‑list of venues/actions** (e.g., Polymarket CLOB) and **per‑tx caps**.
  - Permissions are **revocable**; allowances can be reduced to zero.
- Always provide a **dry‑run preview** (paper) before enabling live mode.

---

### Phase 1 — Paper Trading MVP (Easy→Medium)

**Goal**: Validate core concept with minimal scope

**Core Features:**
- Parse & validate simplified JSON plans (5 required fields: planId, mode, tradeInstructions)
- **Paper mode only** (no live trading yet)
- **BUY orders only** (SELL orders in Phase 2+)
- Limit order placement for YES/NO outcomes
- Order sizing in USDC collateral (e.g., "buy $500 of YES @ 0.42")
- Basic fill simulation against order book snapshot
- Persist orders, executions, runs to Postgres (3 tables)
- Calculate P&L on-the-fly from executions (no positions table)
- Idempotency: `planId` to avoid duplicate submissions
- CLI invocation: `pnpm run trade <file-path>`
- Fail-fast error handling (no retry queues)
- Sequential execution (one plan at a time)

**Deliverables:**
- TypeScript project setup with `pnpm`
- Environment variable configuration (`.env.local` file with optional Polymarket credentials)
- Credential generation script: `pnpm run generate-creds`
- Simplified JSON schema (5 required fields)
- JSON Schema file at `/src/domain/schemas/trade-plan-v1.schema.json`
- Zod validation for trade plans
- Postgres database with 3 tables (orders, executions, runs)
- Drizzle ORM setup
- Basic paper trading engine (immediate fill logic only)
- CLI entry point: `pnpm run trade <file-path>`
- Position calculation from executions
- Run summary output (stdout + DB)
- Local development with Docker Compose (Postgres)
- Documentation for credential setup (optional in Phase 1)

**Constraints (Explicitly Excludes):**
- SELL orders (requires token quantity management)
- Order cancellations and expiry
- Price guards (ceil/floor)
- Risk checks
- Live trading mode
- Automated scheduling
- Concurrent plan execution
- File-based input only (no S3/DB loading)
- Manual execution (no cron)
- Simple fill logic (if limit crosses spread, fill at best price)

**Success Criteria:**
- All 5 user stories implemented (US-0 through US-5)
- All 5 test scenarios passing
- Can run `pnpm run trade plan.json` and see results
- Database persists orders, executions, runs correctly
- Idempotency works (duplicate planId rejected)

---

### Phase 2 — Paper Trading Quality (Medium)

**Goal**: Enhance paper trading with advanced features and performance optimizations

**Core Features:**
- **SELL orders** with token quantity sizing
- Cancel‑after (time‑based) for GTT orders
- Position/PNL tracking with dedicated `positions` table (performance)
- Better fill simulation with slippage modeling
- Detailed run reports with P&L breakdown per market
- Helper utilities: USDC ↔ token quantity conversion
- Add `defaults` section to JSON schema (maxNotionalUSD, goodForSeconds)
- Time expiry checking and order cleanup
- `audit_logs` table for structured event tracking

**Deliverables:**
- `positions` table schema and repository
- `audit_logs` table schema and repository
- Enhanced fill simulation engine with slippage model
- SELL order support in validation and execution
- Cancel-after logic with scheduled cleanup
- Extended JSON schema with optional fields
- Token quantity conversion utilities
- Detailed run report generator

**Success Criteria:**
- SELL orders execute correctly in paper mode
- Positions table stays in sync with executions
- Orders expire correctly based on `cancelAfter`
- Run reports show detailed P&L breakdown
- Audit logs capture all key events

---

### Phase 3 — Live Trading Adapter (Hardest)

**Goal**: Enable real on-chain trading via Polymarket CLOB

**Core Features:**
- Polymarket API integration (markets, orders, status)
- Live mode execution via Polymarket CLOB
- Wallet balance checks (USDC and outcome tokens)
- Token approval validation (USDC + CTF)
- Error handling and retry logic with exponential backoff
- Idempotency for on-chain operations
- Order status polling and reconciliation
- External order/execution ID tracking
- Pre-trade risk checks (balance, approvals, venue status)

**Deliverables:**
- Complete Polymarket adapter (`adapters/polymarketClient.ts`)
  - `placeOrder()`, `cancelOrder()`, `getOrderStatus()`
  - `getOrderBook()`, `getMarketPrice()`
  - Error handling and retries
- Live trading engine (`core/liveEngine.ts`)
  - Pre-trade checks
  - Order placement and tracking
  - Fill reconciliation
- Token allowances helper script (`scripts/set-allowances.ts`)
- Database schema updates:
  - `external_order_id` field on orders
  - `external_execution_id` field on executions
- Mode routing logic in executor (paper vs live)
- Comprehensive error codes and logging

**Prerequisites:**
- Phase 2 complete (SELL orders and positions table required)
- Polymarket credentials configured
- Wallet funded with USDC on Polygon
- Token allowances set

**Success Criteria:**
- Can place live BUY and SELL orders on Polymarket
- Orders tracked correctly with external IDs
- Fills reconciled to database accurately
- Balance checks prevent overdrafts
- Idempotency prevents duplicate live orders
- Errors handled gracefully with retries

### Phase 4 — Market-Making with AI Signal Tilt (Advanced)
**Goal**: Provide liquidity on both sides of the book while skewing quotes toward AI forecasts to capture alpha + spread

**Core Concept**: Instead of directional limit orders, post simultaneous BID and ASK quotes (GTC orders) with spread tilted toward BetterAI predictions. This combines market-making (earning spread) with signal-based edge (profit from forecast accuracy).

**Example**:
```
Market mid-price: 0.50
BetterAI forecast: 0.58 (bullish YES signal)
Traditional MM: bid 0.49, ask 0.51 (centered, 2-cent spread)
Tilted MM:       bid 0.52, ask 0.56 (skewed toward 0.58, 4-cent spread)
Result: Capture spread while biasing toward predicted direction
```

**Deliverables**:
- **Strategy engine abstraction** (not just order executor)
  - `/src/strategies/marketMaking.ts` - Core MM strategy implementation
  - `/src/strategies/strategyEngine.ts` - Abstract strategy runner
- **AI signal integration**
  - BetterAI API adapter for forecast ingestion
  - Signal validation and staleness checks
  - Signal-to-price conversion utilities
- **Quote management system**
  - Dual-sided order posting (BID + ASK simultaneously)
  - Cancel/replace loop for quote updates
  - Quote synchronization (ensure both sides posted atomically)
- **Tilt calculation engine**
  - `calculateTiltedSpread(signal, spreadBps, tiltFactor)` → { bid, ask }
  - `calculateOptimalSpread(volatility, volume)` → spreadBps
  - Configurable tilt factor (0 = neutral MM, 1 = full signal weight)
- **Inventory management**
  - Position tracking with max inventory limits
  - Inventory-based quote skewing (reduce exposure on imbalanced side)
  - `checkInventoryLimits(position, maxInventory)` → boolean
- **GTC order support**
  - Add `timeInForce` field to order schema (GTC, GTD, FOK, FAK)
  - Track open orders per market
  - Implement order cancellation via Polymarket API
- **Real-time execution** (not batch-only)
  - Continuous quote monitoring and adjustment
  - Event-driven updates on fills or signal changes
  - `shouldUpdateQuotes(currentBid, currentAsk, newSignal)` → boolean
- **JSON Schema Extension**
  ```jsonc
  {
    "planId": "mm-tilt-001",
    "mode": "live",
    "strategy": "market-making-tilt",
    "marketMakingConfig": {
      "marketId": "MARKET_ID",
      "outcome": "YES",
      "aiSignal": 0.58,           // BetterAI forecast (0-1)
      "spreadBps": 400,            // Total spread in basis points (4%)
      "tiltFactor": 0.6,           // Weight toward signal (0-1)
      "maxInventory": 1000,        // Max position size (USDC)
      "minSpread": 100,            // Minimum spread (1%)
      "quoteSize": 500,            // Size per quote side (USDC)
      "updateThresholdBps": 50     // Update quotes if signal moves 0.5%
    }
  }
  ```

**Key Implementation Details**:

1. **Polymarket Order Types Used**:
   - **GTC (Good-Til-Cancelled)**: Primary order type for market-making
   - Post BID as GTC BUY order at tilted price
   - Post ASK as GTC SELL order at tilted price
   - Cancel/replace when signal or market changes

2. **Order Flow**:
   ```typescript
   // Continuous loop
   1. Fetch BetterAI signal
   2. Calculate tilted bid/ask prices
   3. Check inventory limits
   4. Cancel existing quotes (if any)
   5. Post new BID (GTC BUY)
   6. Post new ASK (GTC SELL)
   7. Monitor for fills
   8. Update position tracking
   9. Repeat when signal/market changes
   ```

3. **Tilt Algorithm**:
   ```typescript
   function calculateTiltedSpread(
     aiSignal: number,      // 0.58
     spreadBps: number,     // 400 (4%)
     tiltFactor: number     // 0.6 (60% toward signal)
   ): { bid: number, ask: number } {
     const marketMid = getCurrentMid(); // e.g., 0.50
     const spread = spreadBps / 10000;  // 0.04

     // Tilt center point toward AI signal
     const center = marketMid * (1 - tiltFactor) + aiSignal * tiltFactor;
     // center = 0.50 * 0.4 + 0.58 * 0.6 = 0.548

     return {
       bid: center - spread / 2,  // 0.548 - 0.02 = 0.528
       ask: center + spread / 2   // 0.548 + 0.02 = 0.568
     };
   }
   ```

4. **Inventory-Based Adjustments**:
   - If long position grows too large → widen ask, tighten bid (encourage selling)
   - If short position grows too large → widen bid, tighten ask (encourage buying)
   - Halt quoting if inventory limit breached

**Prerequisites**:
- ✅ Phase 2: SELL orders and positions table
- ✅ Phase 3: Live trading via Polymarket CLOB
- ❌ NEW: Strategy abstraction layer
- ❌ NEW: Real-time execution engine (not batch)
- ❌ NEW: External signal API integration
- ❌ NEW: Cancel/replace order management
- ❌ NEW: GTC order support

**Success Criteria**:
- Can post dual-sided quotes tilted toward AI signal
- Quotes update automatically when signal changes
- Inventory limits prevent runaway positions
- Spread earned on fills while capturing directional alpha
- Backtest shows improved Sharpe ratio vs directional-only

**Complexity**: **Hard** (requires paradigm shift from batch executor to continuous strategy engine)

**Phase 4 Notes**:
- This transforms BetterOMS from a simple order executor into a **quant trading bot**
- Consider building as separate module/service that uses BetterOMS as infrastructure
- Requires robust error handling (what if one side posts but other fails?)
- May need dedicated infrastructure (not serverless due to continuous execution)

---

---

### Phase 5 — Controls & Triggers (Medium)

**Goal**: Add risk controls and advanced order types

**Core Features:**
- **Price guards** (ceil/floor) at submit time
  - Do not buy if mid > priceCeil
  - Do not sell if mid < priceFloor
- Simple **stop loss / take profit** logic (cancel+replace)
- Per-run risk checks:
  - Max notional USD per run
  - Max number of orders per run
  - Venue heartbeat check
- Retry policy with exponential backoff (configurable)

**Deliverables:**
- Price guard validation in order submission
- Stop loss/take profit trigger engine
- Risk check framework
- Configurable risk limits in JSON schema
- Database fields: `price_ceil`, `price_floor` on orders
- Enhanced error handling with retry policies

**Success Criteria:**
- Orders rejected if guards violated
- Stop loss triggers cancel+replace correctly
- Risk limits prevent oversized runs
- Retries handle transient failures gracefully

---

### Phase 6 — Security & Dashboard (Medium)

**Goal**: Improve security and add monitoring UI

**Core Features:**
- **Delegated signer** smart contract on Polygon (revocable)
  - Avoid storing raw private keys in application
  - Spend limits and allowances
  - Venue allow-list
- Minimal React dashboard UI:
  - View runs, open orders, fills
  - Display P&L summaries
  - Show logs and errors
- Backtesting harness (replay historical order books)

**Deliverables:**
- Delegate Executor smart contract (Solidity)
  - Deploy to Polygon testnet
  - Deploy to Polygon mainnet
- BetterOMS integration with delegated signer
- React/Next.js dashboard application
  - Runs list view
  - Orders view
  - P&L summary
  - Logs viewer
- Backtest runner implementation

**Success Criteria:**
- Delegated signer works for live trades
- Dashboard displays real-time data
- Backtest runner can replay historical scenarios
- Security improved (no raw private keys in app)

---

### Phase 7 — Automation (Medium)

**Goal**: Enable scheduled execution and multi-plan orchestration

**Core Features:**
- Vercel Cron for scheduled execution (hourly default)
- Multi-file loading (directory scan, S3, or DB)
- S3/DB-backed plan storage
- Plan activation/deactivation
- Plan prioritization and queuing
- Maintenance tasks (cancel-after cleanup, position sync)

**Deliverables:**
- Vercel serverless function with cron trigger
- Multi-file loader implementation
- S3 integration for plan storage
- Database schema for plan management
- Plan queue and priority system
- Scheduled maintenance jobs

**Success Criteria:**
- Cron executes plans on schedule
- Multiple plans processed per run
- Plans can be managed via S3 or database
- Maintenance tasks run automatically

---

## Nice‑to‑Haves (Later)
- Backtest runner that replays historical books (or mid/close prices) for plan evaluation.
- Strategy library (e.g., “enter on dip”, “fade spike”, “mean reversion”).
- Alerting (webhooks/Slack) on fills, breaches, or errors.
- Multi‑plan orchestration with priorities and capital budgeting.

---

## Polymarket API Credential Setup

For detailed credential setup instructions, see [spec-credential-setup.md](spec-credential-setup.md).

---



## JSON Input

### Phase 1 (Simplified Schema)
Minimal required fields only - no optional features, no defaults section.

#### Human-Readable Example
```jsonc
{
  "planId": "2025-09-27-1200Z",
  "mode": "paper",              // "paper" only in Phase 1
  "tradeInstructions": [
    {
      "marketId": "MARKET_ID_OR_SLUG",
      "outcome": "YES",         // "YES" | "NO"
      "side": "BUY",            // "BUY" only in Phase 1
      "price": 0.42,            // 0..1 (probability as decimal)
      "size": 500               // USDC amount to spend (e.g., $500)
    }
  ]
}
```

#### JSON Schema Definition
The formal schema is available at [/src/domain/schemas/trade-plan-v1.schema.json](../src/domain/schemas/trade-plan-v1.schema.json) and can be referenced in JSON files via:
```json
{
  "$schema": "./src/domain/schemas/trade-plan-v1.schema.json"
}
```

This enables editor autocomplete and validation in VSCode and other IDEs.

#### TypeScript Types
Runtime validation uses Zod schemas in [/src/domain/validation.ts](../src/domain/validation.ts):
```typescript
import { z } from 'zod';

/** Phase 1 Trade Plan Schema */
export const TradePlanSchema = z.object({
  /** Unique plan identifier for idempotency (prevents duplicate runs) */
  planId: z.string().min(1),

  /** Trading mode - only 'paper' supported in Phase 1 */
  mode: z.literal("paper"),

  /** Array of limit orders to place */
  tradeInstructions: z.array(z.object({
    /** Polymarket market ID or slug */
    marketId: z.string().min(1),

    /** Outcome side: YES or NO */
    outcome: z.enum(["YES", "NO"]),

    /** Order side - only BUY in Phase 1 (SELL in Phase 2+) */
    side: z.enum(["BUY"]),

    /** Limit price as decimal probability (e.g., 0.42 = 42%) */
    price: z.number().min(0).max(1),

    /** USDC collateral amount (e.g., 500 = $500 USDC) */
    size: z.number().positive()
  })).min(1)
});

export type TradePlan = z.infer<typeof TradePlanSchema>;
```

**Phase 1 constraints:**
- `mode`: Must be "paper" (live trading in Phase 3)
- `side`: Must be "BUY" (SELL orders in Phase 2)
- `size`: USDC collateral amount (token quantities in Phase 2)
- No `defaults` section
- No `timeInForce`, `cancelAfterSec` (orders don't expire)
- No `priceCeil`, `priceFloor` guards (Phase 4 feature)
- No `notes` field
- `type` assumed to be `LIMIT` (only order type)

### Phase 2+ (Full Schema)
```jsonc
{
  "planId": "2025-09-27-1200Z",
  "mode": "paper",
  "defaults": {
    "maxNotionalUSD": 2000,
    "goodForSeconds": 10800     // 3h
  },
  "tradeInstructions": [
    {
      "marketId": "MARKET_ID_OR_SLUG",
      "outcome": "YES",
      "side": "BUY",
      "type": "LIMIT",
      "price": 0.42,
      "size": 500,
      "timeInForce": "GTT",     // Good till time
      "cancelAfterSec": 7200,
      "priceCeil": 0.45,        // do not buy if mid > ceil
      "priceFloor": 0.38,       // do not sell if mid < floor
      "notes": "enter on dip"
    }
  ]
}
```

### Validation
- Use **zod** for schemas; reject ill-formed plans with precise errors.
- Convert between **probability ↔ price** helpers in `utils/math.ts`.

---

## Open Questions / TODO
- Pin down Polymarket endpoints & auth model for Phase 3 (real trading).
- Decide paper engine's liquidity assumptions per market category.
- Confirm USDC decimals/allowances on Polygon and token addresses.
- Design the Delegate Executor's on‑chain guards (venue allow‑list, caps).
- Define reporting format for run summaries (human + JSON).


---



## Design Decisions & FAQs

### Market Discovery
**Q: How will users identify marketId values for trade plans?**
A: Users identify marketId separately (via Polymarket UI, API, or external tools). BetterOMS does not include a market browser/search feature.

### Position Sizing
**Q: Should orders be sized in USDC collateral or outcome token quantities?**
A: **Phase 1 simplification: Use USDC collateral only for BUY orders.**
- BUY orders: `size` field represents USDC amount to spend (e.g., 500 = $500 USDC)
- SELL orders: Not supported in Phase 1 (paper mode only)
- Rationale: Simpler for users ("I want to buy $500 of YES") and matches Polymarket API flexibility

**Phase 2+**: Add support for:
- Token-quantity sizing (e.g., "buy 1000 shares")
- SELL orders sized in token quantities
- Helper utilities to convert between USDC ↔ token quantities

### Error Handling
**Q: What happens when Polymarket APIs are down during a batch run?**
A: **Fail fast.** Do not queue orders for retry.
- Log error to runs table (`status: 'failed'`, `error_message`)
- Exit with non-zero status code
- User must manually retry by re-running the command

### Concurrency
**Q: Can multiple trade plans run simultaneously?**
A: **Sequential execution only.** Phase 1 processes one plan at a time.
- Single CLI invocation = one plan file
- No concurrent execution of multiple plans
- Phase 6 may add plan queuing/orchestration
