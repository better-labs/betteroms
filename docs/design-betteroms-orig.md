# BetterOMS — Single‑User Order Management System for Polymarket (Polygon)

(as of 9/29)

## TL;DR
A single‑user, batch‑executed trading orchestration tool for Polymarket on Polygon. To be used for both live trading and paper trading (for benchmark purposes).It accepts JSON trade plans (with a **paper vs. live** toggle), runs on an hourly cron, and executes/updates/cancels orders via Polymarket APIs.

Future phases add price triggers, expirations, and (optional) delegated smart‑contract signing to avoid handling raw private keys.

---

## Scope & Goals
- **User**: one operator (you).
- **Exchanges**: **Polymarket** (Polygon).
- **Order types**: YES/NO outcome orders with **BUY/SELL** sides; supports **MARKET** (immediate execution at best available price) and **LIMIT** orders (execute at specified price or better).
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
  # Database connection (required)
  DATABASE_URL=postgresql://user:password@host:port/database

  # Polymarket credentials (optional in Phase 1 paper mode)
  POLYMARKET_PRIVATE_KEY=your_private_key_here
  POLYMARKET_API_KEY=your_api_key_here
  POLYMARKET_API_SECRET=your_api_secret_here
  POLYMARKET_API_PASSPHRASE=your_passphrase_here
  ```
- System validates `.env.local` exists and contains required variables on startup
- Private key is NEVER logged or displayed in output
- `.env.local` file is git-ignored by default (in `.gitignore`)
- `.env.example` file should be provided with placeholder values for reference

**Phase 1 Note:**
- API credentials are optional in Phase 1 (paper mode)
- Paper mode can use public market data endpoints (no authentication required)
- Live trading (Phase 3) will require full API credentials

**`.env.example` Template:**
```bash
# Database connection (required for all phases)
DATABASE_URL=postgresql://user:password@host:port/database

# Polymarket credentials (optional in Phase 1 paper mode, required for Phase 3+ live trading)
POLYMARKET_PRIVATE_KEY=your_private_key_here
POLYMARKET_API_KEY=your_api_key_here
POLYMARKET_API_SECRET=your_api_secret_here
POLYMARKET_API_PASSPHRASE=your_passphrase_here
```

**Security Considerations:**
- Private key grants full access to wallet funds - treat as highly sensitive
- API credentials are deterministically derived from private key signature
- Future Phase 5: Implement delegated signer contract to avoid handling private keys
- Recommend: Use dedicated trading wallet with limited funds for initial testing
- For Phase 1, recommend using Neon free tier or Supabase free tier for Postgres

---

### US-1: Submit Paper Trade Plan
**As a** trader
**I want to** submit a JSON trade plan in paper mode
**So that** I can simulate trades without risking real capital

**Acceptance Criteria:**
- CLI command accepts file path: `pnpm run execute:trade-plan ./plans/test.json`
- CLI command accepts JSON via stdin: `cat plan.json | pnpm run execute:trade-plan` or `echo '{"planId":...}' | pnpm run execute:trade-plan`
- CLI built with Commander.js for professional UX with help text
- JSON validated against Phase 1 schema (src/domain/schemas/trade-plan-v0.0.2.schema.json)
- Orders persisted to `orders` table with status 'open'
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

### Scenario 6: SELL Order Without Position
```
Given I have no existing position in market "MARKET_ID" for outcome "YES"
When I submit paper SELL order for "YES"
Then system should reject with error "Cannot SELL: no existing position for YES in market MARKET_ID"
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
  - **Phase 1**: Use live hosted Postgres (Neon free tier, Supabase, or Vercel Postgres)
  - **Connection**: `DATABASE_URL` environment variable in `.env.local`
  - **No Docker Compose**: Phase 1 uses cloud-hosted Postgres directly (simpler setup)
  - **Why Postgres-first**: Vercel/serverless platforms don't support SQLite (no persistent filesystem).
- **Key mgmt (Phase 1-5)**: env‑scoped private key in secure secret store (**only if you must**).
- **Key mgmt (Phase 6+)**: **Delegated smart‑contract executor** on Polygon with revocable allowances (see Security).

---

## Project Layout (TypeScript)
```
/services
  /adapters
    polymarketClient.ts      // REST/WS calls, auth, retries
  /core
    executor.ts              // routes to paper vs live
    paperEngine.ts           // fill simulation
    liveEngine.ts            // on-chain execution via adapter
    risk.ts                  // caps, notional limits, sanity checks
  /persistence
    db.ts                    // Drizzle client (Postgres)
    schema.ts                // Drizzle table schemas
    
  /io
    inputLoader.ts           // Phase 1: load JSON from file path or stdin
    logger.ts                // structured logging
  /rules
    timeExpiry.ts            // cancel-after, good-til time
    priceTriggers.ts         // simple stop/take-profit (phase 2)
/domain
  types.ts                   // Order, Market, Position, enums
  validation.ts              // zod schemas for inputs
/utils
  math.ts                    // odds/price conversions
  clock.ts                   // time helpers
/commands
  trade.ts                   // Trade command handler
  generate-creds.ts          // Credential generation command
  db-migrate.ts              // Phase 2+: database migration command
  set-allowances.ts          // Phase 3+: token allowances command
/cli.ts                      // CLI entry point using Commander.js
/package.json                // scripts: betteroms, execute:trade-plan, generate-creds, dev, db:*
/.env.local                  // git-ignored secrets (never commit!)
/.env.example                // example env file with placeholders (committed)
/.gitignore                  // must include .env.local
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
    "dotenv": "^latest",
    "commander": "^latest"
  },
  "scripts": {
    "betteroms": "tsx cli.ts",
    "execute:trade-plan": "tsx cli.ts execute:trade-plan",
    "generate-creds": "tsx cli.ts generate-creds",
    "dev": "tsx watch cli.ts",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:studio": "drizzle-kit studio"
  }
}
```

**CLI Design Philosophy:**
- **Commander.js**: Professional CLI framework with built-in help, version info, and command structure
- **Command-based**: Each major function is a separate command (inspired by betteraiengine CLI)
- **Extensible**: Easy to add new commands in future phases
- **Type-safe**: Full TypeScript integration with proper error handling
- **stdin support**: Automatic detection of piped input for scripting/automation

**Commands:**
- `execute:trade-plan [file-path]`: Execute trade plan (file or stdin)
- `generate:creds`: Generate Polymarket API credentials
- `list:positions`: View current positions (Phase 2)
- `list:runs`: View execution history (Phase 2)


---


# Phased Task Plan

This section consolidates deliverables, constraints, and success criteria for each development phase.

---

## Paper Trading Engine (Phase 1-2)
- Pull latest **order book snapshot** from **Polymarket CLOB API** for each market at execution time.
- **Data Source**: Use Polymarket public CLOB API endpoints (no authentication required in Phase 1 paper mode)
- Fill logic:
  1. **MARKET orders**: Always fill 100% immediately at current best opposing price
  2. **LIMIT orders**: If limit price **crosses or equals** opposing best, assume immediate fill at best price. Otherwise, leave as **resting order** (status 'open') in simulated book.
- **SELL order validation**: Check for existing position before allowing SELL orders. Error if no position exists (Phase 1 does not support short positions).
- **Slippage model (Phase 1)**: Zero slippage - orders fill at exact best opposing price (no price impact simulation)
- **Sizing**: Both BUY and SELL orders sized in USDC collateral (e.g., size: 500 = $500 USDC worth of tokens)
- Record simulated executions and positions identically to live mode.

*Note*: Deterministic by seeding with `planId` + marketId for repeatable tests.

---

## Live Trading Flow (Phase 3+)
1. **Discover** market + outcome tokens (via Polymarket API).
2. **Pre‑trade checks**: wallet balance, approvals (USDC & outcome tokens if needed), venue status.
3. **Place order**: limit BUY/SELL at specified price/size.
4. **Track**: poll order status next batch; cancel if past `cancelAfterSec`.
5. **Reconcile**: update fills → positions → PnL.

> Implementation detail will depend on Polymarket's current REST/WS endpoints for markets, order placement, order status, and cancel. Wrap all calls in `services/adapters/polymarketClient.ts` with strong typing and retries.

---

## Batch Scheduling

### Phase 1 (File-Based and stdin)
- **Invocation**: Manual command-line execution via Commander.js CLI
- **CLI Structure**: `pnpm run betteroms <command> [options]`
  - Main commands: `execute:trade-plan`, `generate-creds`
  - Built-in help: `pnpm run betteroms --help` or `pnpm run betteroms execute:trade-plan --help`
- **Input**: Single JSON trade plan via one of two methods:
  - **File path**: `pnpm run execute:trade-plan ./plans/my-trade.json`
  - **stdin (pipe)**: `cat plan.json | pnpm run execute:trade-plan` or `echo '{"planId":...}' | pnpm run execute:trade-plan`
  - **stdin (heredoc)**:
    ```bash
    pnpm run execute:trade-plan <<EOF
    {"planId":"test-001","mode":"paper","trades":[...]}
    EOF
    ```
  - No S3, database, or multi-file loading in Phase 1
- **Execution flow**:
  - Commander.js parses command and arguments
  - Command handler loads JSON plan from file path (if provided) OR stdin (if no file path)
  - Validate JSON plan against Zod schema
  - Execute trades (paper or live mode)
  - Emit run report (JSON + human log)
  - Exit with appropriate status code

### Phase 2+ (Automated Scheduling)
- **Default**: every **60 min** (env `CRON_INTERVAL_MINUTES`) via cron or serverless scheduler
- On each run:
  - Load active JSON trade plans (filesystem directory scan, S3, or DB).
  - For each plan: validate → risk checks → execute (paper or live).
  - Run **maintenance**: cancel‑after, stale order cleanup, sync positions.
  - Emit a run report (JSON + human log).

---

---

### Phase 1 — Paper Trading MVP (Easy→Medium)

**Goal**: Validate core concept with minimal scope

**Core Features:**
- Parse & validate simplified JSON plans (6 required fields: planId, mode, trades with marketId, outcome, side, orderType, size; price required for LIMIT orders)
- **Paper mode only** (no live trading yet)
- **BUY and SELL orders** supported
- **MARKET and LIMIT order types** supported
- **MARKET orders**: Always fill 100% at current best opposing price
- **LIMIT orders**: Fill if limit crosses spread, otherwise remain open
- Order placement for YES/NO outcomes
- Order sizing in USDC collateral (e.g., "buy $500 of YES @ 0.42")
- **SELL order validation**: Reject SELL orders when no existing position (no short positions in Phase 1)
- Basic fill simulation against Polymarket CLOB API order book snapshot
- Persist orders, executions, runs to Postgres (3 tables)
- Calculate P&L on-the-fly from executions (no positions table)
- Idempotency: `planId` to avoid duplicate submissions
- CLI invocation: `pnpm run execute:trade-plan <file-path>` OR `cat plan.json | pnpm run execute:trade-plan`
- Fail-fast error handling (no retry queues)
- Sequential execution (one plan at a time)

**Deliverables:**
- TypeScript project setup with `pnpm`
- Environment variable configuration:
  - `.env.example` file with placeholders (committed to repo)
  - `.env.local` file for actual credentials (git-ignored)
  - `DATABASE_URL` for live Postgres connection (Neon, Supabase, or Vercel Postgres)
  - Optional Polymarket credentials for Phase 1
- Commander.js CLI structure (`cli.ts` + `/commands` directory)
  - `execute:trade-plan` command: Execute trade plans
  - `generate-creds` command: Generate Polymarket credentials
  - Built-in help and version info
- JSON schema supporting BUY/SELL and MARKET/LIMIT orders (6 required fields, price conditional on orderType)
- JSON Schema file at `src/domain/schemas/trade-plan-v0.0.2.schema.json`
- Zod validation for trade plans
- Market ID parsing logic: distinguish between Polymarket market IDs and slugs, handle both formats
- Postgres database with 3 tables (orders, executions, runs)
- Drizzle ORM setup with live Postgres connection
- Basic paper trading engine with zero slippage:
  - MARKET orders: fill 100% at best opposing price
  - LIMIT orders: fill if crossing spread, otherwise remain open
  - SELL validation: check for existing position
- CLI supporting file path or stdin: `pnpm run execute:trade-plan <file-path>` OR `cat plan.json | pnpm run execute:trade-plan`
- Position calculation from executions (on-the-fly, no positions table)
- Run summary output (stdout + DB)
- Light automated testing for core scenarios
- Documentation for credential setup and database setup

**Constraints (Explicitly Excludes):**
- Order cancellations and expiry
- Price guards (ceil/floor)
- Risk checks
- Live trading mode
- Automated scheduling
- Concurrent plan execution
- No S3 or database-backed plan loading (Phase 1 uses file path or stdin only)
- Manual execution (no cron)

**Success Criteria:**
- All 5 user stories implemented (US-0 through US-5)
- All 6 test scenarios passing (including SELL order validation)
- Can run `pnpm run execute:trade-plan plan.json` and see results
- Database persists orders, executions, runs correctly
- Idempotency works (duplicate planId rejected)
- SELL orders without existing positions are rejected with clear error
- MARKET orders fill 100% at best price
- LIMIT orders fill when crossing spread, otherwise remain open

---

### Phase 2 — Paper Trading Quality (Medium)

**Goal**: Enhance paper trading with advanced features and performance optimizations

**Core Features:**
- Token quantity sizing (Phase 1 uses USDC collateral only)
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
- Token quantity sizing support (in addition to USDC collateral)
- Cancel-after logic with scheduled cleanup
- Extended JSON schema with optional fields
- Token quantity conversion utilities
- Detailed run report generator

**Success Criteria:**
- Token quantity sizing works correctly for both BUY and SELL orders
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
- Complete Polymarket adapter (`services/adapters/polymarketClient.ts`)
  - `placeOrder()`, `cancelOrder()`, `getOrderStatus()`
  - `getOrderBook()`, `getMarketPrice()`
  - Error handling and retries
- Live trading engine (`services/core/liveEngine.ts`)
  - Pre-trade checks
  - Order placement and tracking
  - Fill reconciliation
- Token allowances helper command (`commands/set-allowances.ts`)
- Database schema updates:
  - `external_order_id` field on orders
  - `external_execution_id` field on executions
- Mode routing logic in executor (paper vs live)
- Comprehensive error codes and logging

**Prerequisites:**
- Phase 2 complete (positions table and token quantity sizing required)
- Polymarket credentials configured
- Wallet funded with USDC on Polygon
- Token allowances set

**Success Criteria:**
- Can place live BUY and SELL orders on Polymarket (both MARKET and LIMIT types)
- Orders tracked correctly with external IDs
- Fills reconciled to database accurately
- Balance checks prevent overdrafts
- Idempotency prevents duplicate live orders
- Errors handled gracefully with retries


---


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
  "trades": [
    {
      "marketId": "MARKET_ID_OR_SLUG",
      "outcome": "YES",         // "YES" | "NO"
      "side": "BUY",            // "BUY" | "SELL"
      "orderType": "LIMIT",     // "MARKET" | "LIMIT"
      "price": 0.42,            // 0..1 (required for LIMIT, ignored for MARKET)
      "size": 500               // USDC amount to spend (e.g., $500)
    },
    {
      "marketId": "ANOTHER_MARKET",
      "outcome": "NO",
      "side": "BUY",
      "orderType": "MARKET",    // Market order - executes at best available price
      "size": 300               // No price field needed for MARKET orders
    }
  ]
}
```

#### JSON Schema Definition
The formal schema is available at `src/domain/schemas/trade-plan-v0.0.2.schema.json` and can be referenced in JSON files via:
```json
{
  "$schema": "./src/domain/schemas/trade-plan-v0.0.2.schema.json"
}
```

This enables editor autocomplete and validation in VSCode and other IDEs.

#### TypeScript Types
Runtime validation uses Zod schemas in `/domain/validation.ts`:
```typescript
import { z } from 'zod';

/** Phase 1 Trade Plan Schema */
export const TradePlanSchema = z.object({
  /** Unique plan identifier for idempotency (prevents duplicate runs) */
  planId: z.string().min(1),

  /** Trading mode - only 'paper' supported in Phase 1 */
  mode: z.literal("paper"),

  /** Array of orders to place */
  trades: z.array(z.object({
    /** Polymarket market ID or slug */
    marketId: z.string().min(1),

    /** Outcome side: YES or NO */
    outcome: z.enum(["YES", "NO"]),

    /** Order side: BUY or SELL */
    side: z.enum(["BUY", "SELL"]),

    /** Order type: MARKET or LIMIT */
    orderType: z.enum(["MARKET", "LIMIT"]),

    /** Limit price as decimal probability (required for LIMIT orders) */
    price: z.number().min(0).max(1).optional(),

    /** USDC collateral amount (e.g., 500 = $500 USDC) */
    size: z.number().positive()
  })).min(1)
}).refine(
  (data) => {
    // Validate that LIMIT orders have a price
    return data.trades.every(
      (trade) => trade.orderType !== "LIMIT" || trade.price !== undefined
    );
  },
  { message: "LIMIT orders must specify a price" }
);

export type TradePlan = z.infer<typeof TradePlanSchema>;
```

**Phase 1 constraints:**
- `mode`: Must be "paper" (live trading in Phase 3)
- `side`: "BUY" or "SELL" supported
- `orderType`: "MARKET" (immediate execution) or "LIMIT" (price-based)
- `price`: Required for LIMIT orders, ignored for MARKET orders
- `size`: USDC collateral amount (token quantities in Phase 2)
- No `defaults` section
- No `timeInForce`, `cancelAfterSec` (orders don't expire)
- No `priceCeil`, `priceFloor` guards (Phase 4 feature)
- No `notes` field

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

**Q: Should validation accept market IDs, slugs, or both?**
A: **Phase 1 accepts both formats.**
- **Market IDs**: CLOB-style IDs (e.g., "0x1234567890abcdef...")
- **Market Slugs**: Human-readable slugs (e.g., "will-donald-trump-win-2024")
- **Parsing logic**: Distinguish between formats:
  - If starts with "0x" or is all hex/numeric → treat as market ID
  - Otherwise → treat as slug, resolve to market ID via Polymarket API
- Store resolved market ID in database for consistency

### Position Sizing
**Q: Should orders be sized in USDC collateral or outcome token quantities?**
A: **Phase 1: Use USDC collateral sizing for both BUY and SELL orders.**
- `size: 500` means **$500 USDC worth** for both BUY and SELL orders
- **BUY example**: `size: 500` at price 0.40 → buy $500 / 0.40 = 1250 tokens
- **SELL example**: `size: 500` at price 0.60 → sell $500 / 0.60 = 833 tokens (must have existing position)
- Rationale: Simpler for users ("I want to buy $500 of YES" or "I want to sell $300 worth") and matches Polymarket API flexibility

**Phase 2+**: Add support for:
- Token-quantity sizing (e.g., "buy 1000 shares")
- Both sizing modes for BUY and SELL orders
- Helper utilities to convert between USDC ↔ token quantities

### Slippage Model
**Q: How should Phase 1 simulate slippage?**
A: **Zero slippage in Phase 1.**
- Orders fill at exact best opposing price from order book
- No price impact simulation
- No liquidity depth analysis
- Deterministic and predictable fills
- **Rationale**: Simplifies Phase 1 implementation; slippage modeling added in Phase 2

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

### Testing Strategy
**Q: Should Phase 1 include automated tests?**
A: **Light automated testing approach.**
- Focus on core business logic (validation, fill simulation, position calculation)
- Test critical scenarios from Test Scenarios section (6 scenarios)
- Integration tests for database operations
- No need for full E2E testing or comprehensive coverage in Phase 1
- Manual testing sufficient for CLI and Polymarket API integration
- Expand test coverage in Phase 2+

### Input Method (stdin vs File)
**Q: How should the CLI accept JSON trade plans?**
A: **Mixed approach (file path OR stdin) using Commander.js.**
- **File path** (primary): `pnpm run execute:trade-plan ./plans/test.json`
- **stdin (piped)**: `cat plan.json | pnpm run execute:trade-plan` or `echo '{"planId":"test",...}' | pnpm run execute:trade-plan`
- **stdin (heredoc)**:
  ```bash
  pnpm run execute:trade-plan <<EOF
  {"planId":"test-001","mode":"paper","trades":[...]}
  EOF
  ```

**Implementation approach using Commander.js:**

**`cli.ts` (main CLI entry point):**
```typescript
#!/usr/bin/env node
import 'dotenv/config';
import { Command } from 'commander';
import { tradeCommand } from './commands/trade.js';
import { generateCredsCommand } from './commands/generate-creds.js';

const program = new Command();

program
  .name('betteroms')
  .description('BetterOMS - Order Management System for Polymarket')
  .version('0.1.0');

// Trade command
program
  .command('execute:trade-plan')
  .description('Execute a trade plan (paper or live mode)')
  .argument('[file-path]', 'Path to JSON trade plan file (or use stdin)')
  .action(tradeCommand);

// Generate credentials command
program
  .command('generate-creds')
  .description('Generate Polymarket API credentials from private key')
  .action(generateCredsCommand);

// Phase 2+: Additional commands
// program
//   .command('set-allowances')
//   .description('Approve USDC and CTF token allowances for Polymarket')
//   .action(setAllowancesCommand);

program.parse(process.argv);
```

**`commands/trade.ts` (trade command handler):**
```typescript
import * as fs from 'fs/promises';
import { executeTradePlan } from '../services/core/executor.js';
import { TradePlanSchema } from '../domain/validation.js';
import { logger } from '../services/io/logger.js';

export async function tradeCommand(filePath?: string) {
  try {
    // Load trade plan from file or stdin
    const jsonContent = await loadTradePlan(filePath);

    // Parse and validate JSON
    const tradePlan = JSON.parse(jsonContent);
    const validated = TradePlanSchema.parse(tradePlan);

    // Execute trade plan
    logger.info(`Executing trade plan: ${validated.planId}`);
    const result = await executeTradePlan(validated);

    // Display summary
    logger.info('Trade execution completed', result);
    process.exit(0);
  } catch (error) {
    logger.error('Trade execution failed', error);
    process.exit(1);
  }
}

async function loadTradePlan(filePath?: string): Promise<string> {
  if (filePath) {
    // File path provided as argument
    return await fs.readFile(filePath, 'utf-8');
  } else if (!process.stdin.isTTY) {
    // stdin is piped (not a terminal)
    return await readStdin();
  } else {
    // No input provided
    throw new Error(
      'Usage: pnpm run execute:trade-plan <file-path> OR pipe JSON via stdin\n' +
      'Examples:\n' +
      '  pnpm run execute:trade-plan ./plans/test.json\n' +
      '  cat plan.json | pnpm run execute:trade-plan\n' +
      '  echo \'{"planId":...}\' | pnpm run execute:trade-plan'
    );
  }
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf-8');
}
```









## Persistence

BetterOMS uses Postgres with Drizzle ORM (). Schema evolves by phase.

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
  status VARCHAR(20) NOT NULL,       -- 'open' | 'filled' | 'cancelled'

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
