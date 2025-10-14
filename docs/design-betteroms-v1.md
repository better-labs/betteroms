# BetterOMS — Single‑User Order Management System for Polymarket (Polygon)

(as of 9/29)

## TL;DR
A single‑user, batch‑executed trading orchestration tool for Polymarket on Polygon. To be used for both live trading and paper trading (for benchmark purposes).It accepts JSON trade plans (with a **paper vs. live** toggle), runs on an hourly cron, and executes/updates/cancels orders via Polymarket APIs.

Future phases add price triggers, expirations, and (optional) delegated smart‑contract signing to avoid handling raw private keys.

---

## Scope & Goals
- **User**: one operator (you).
- **Exchanges**: **Polymarket** (Polygon).
- **Order types**: YES/NO outcome orders with **BUY/SELL** sides; supports **MARKET** (immediate execution at best available price) and **LIMIT** orders (execute at specified price or better - future phase).
- **Modes**: **paper** (simulate) and **live** (on‑chain via Polymarket APIs).
- **Cadence**: Phase 1 manual CLI; later phases add hourly cron.
- **Latency sensitivity**: low; no HFT ambitions.
- **Out of scope (initial)**: multi‑user, cross‑venue routing, HFT/real‑time websockets, portfolio margining.

### Non‑Goals (for Phase 1)
- Real‑time reactive strategies, co‑location, sub‑second triggers.
- Web App UI (CLI/JSON first; optional dashboard later).

---

## User Stories 

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


### US-6 (Future): Configure Account Credentials
**As a** trader
**I want to** configure my Polymarket credentials with BetterOMS
**So that** the system can fetch market data and (in future phases) execute live trades

**Security Considerations:**
- Private key grants full access to wallet funds - treat as highly sensitive
- API credentials are deterministically derived from private key signature




---

## High‑Level Architecture

- **Trade Runner**: Invoked hourly or on demand; parses input plans, decides paper vs. live, and calls the trade executor.
- **Executor**: routes to the appropriate executor service: paper vs live.
- **CLOB Client Wrapper**: Thin facade around `@polymarket/clob-client` for domain-specific abstractions
  - Leverages official client for all Polymarket API interactions
  - Handles order book fetching, market data, order placement/cancellation
  - No custom REST/WebSocket integration needed
- **Paper Engine**: Deterministic simulator using CLOB client order book snapshots to emulate fills.
- **State Store**: Orders, positions, executions, PnL, audit logs.

---

## Suggested Tech Choices
- **Runtime**: Node.js (TypeScript).
- **Job runner**: Vercel serverless functions (Vercel Cron for automation in later phases).
- **DB**: Postgres from day 1
  - **Connection**: `DATABASE_URL` environment variable in `.env.local`
  - **No Docker Compose**
- **Polymarket Integration**: `@polymarket/clob-client` npm package (v4.22.7+)
  - Official TypeScript client for Polymarket CLOB
  - Handles authentication, order placement/cancellation, market data, order books
  - Eliminates need for custom API integration layer
  - Provides WebSocket support for future real-time features


---

## Example Project Layout (TypeScript)
```
/config
  env.ts
/database
    index.ts                    // Drizzle client (Postgres), getClient(), getdb()
    schema.ts                // Drizzle table schemas
/drizzle                     // meta folder and migrations folder

/features
  /executor
    paper-executor.ts
    executor-router.ts
    executor.repo.ts        // Used to create new instances of the feature in the database
  /trade-runner
    trade-runner.ts

/domain
  /schemas
    /trade-plan-v0.0.2.schema.json
/integrations
  /polymarket
    clob-client.ts         // Configured @polymarket/clob-client instance
    adapter.ts             // Thin wrapper for domain-specific methods
/utils
  math.ts                  // odds/price conversions
  clock.ts                 // time helpers
  logger.ts                // structured logging using pino
/commands
  trade.ts                   // Trade command handler
  generate-creds.ts          // Credential generation command
  db-migrate.ts              // Phase 2+: database migration command
  set-allowances.ts          // Phase 3+: token allowances command
  inputLoader.ts           // Phase 1: load JSON from file path or stdin
cli.ts                      // CLI entry point using Commander.js
package.json                // scripts: betteroms, execute:trade-plan, generate-creds, dev, db:*
.env.local                  // git-ignored secrets (never commit!)
.env.example                // example env file with placeholders (committed)
.gitignore                  // must include .env.local
```

Rules of thumb
- Feature-first: put types in the feature that owns them.
- Shared-but-small: /shared/types/… only for things feature-agnostic error shapes, and env types.


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

## Polymarket CLOB Client Integration Strategy

**Rationale**: Leverage the official `@polymarket/clob-client` TypeScript library instead of building custom API integration from scratch. This accelerates development, reduces maintenance burden, and ensures compatibility with Polymarket's evolving API.

### Key Benefits:
1. **Authentication**: Built-in `createOrDeriveApiKey()` and `deriveApiKey()` methods handle credential generation
2. **Market Data**: Native `getOrderBook()`, `getPrice()`, `getMidPoint()`, `getSpread()` methods
3. **Order Management**: Complete order lifecycle via `createAndPostOrder()`, `cancelOrder()`, `getOpenOrders()`
4. **Live Trading**: Ready-made `createAndPostMarketOrder()` with FOK/IOC support for Phase 3
5. **Real-time**: WebSocket support for future streaming features
6. **Battle-tested**: Production-grade error handling, retries, and type safety

### Integration Approach:
**Thin wrapper pattern** - Create minimal domain-specific facade in `/integrations/polymarket/`:
- `clob-client.ts`: Initialize and export configured `ClobClient` instance
- `adapter.ts`: Domain-specific methods (e.g., `getMarketOrderBook()`, `simulateFill()`) that call CLOB client

**Example structure:**
```typescript
// clob-client.ts
import { ClobClient } from '@polymarket/clob-client';
export const clobClient = new ClobClient(host, chainId);

// adapter.ts
export class PolymarketAdapter {
  async getOrderBookSnapshot(marketId: string) {
    return await clobClient.getOrderBook(marketId);
  }

  async getBestPrices(marketId: string) {
    const [orderBook, midPoint] = await Promise.all([
      clobClient.getOrderBook(marketId),
      clobClient.getMidPoint(marketId)
    ]);
    return { bestBid: orderBook.bids[0], bestAsk: orderBook.asks[0], midPoint };
  }
}
```

### Phase-Specific Usage:

**Phase 1 (Paper Trading)**:
- `getOrderBook()` - fetch order book for fill simulation
- `getLastTradePrice()` - get recent execution prices
- `getMidPoint()` / `getSpread()` - calculate fill prices for MARKET orders
- No authentication required (read-only public endpoints)

**Phase 2 (Advanced Paper Trading)**:
- `getPricesHistory()` - historical data for backtesting
- `getMarketTradesEvents()` - market activity analysis

**Phase 3 (Live Trading)**:
- `createOrDeriveApiKey()` - credential generation (replaces custom `generate-creds` logic)
- `createAndPostOrder()` - place orders with price/size
- `createAndPostMarketOrder()` - immediate market orders
- `cancelOrder()` / `cancelAll()` - order cancellation
- `getOpenOrders()` - position reconciliation
- `getTrades()` - execution history sync

### Dependencies:
```json
{
  "dependencies": {
    "@polymarket/clob-client": "^4.22.7",
    "ethers": "^5.7.2"
  }
}
```

**Note**: `ethers` required for wallet/signer functionality in live trading phases.

---


## Phased Task Plan


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


---

## Phase 1 — Foundation & External Dependencies

**Goal**: Establish project foundation and validate Polymarket CLOB client integration works

**Why this phase?** De-risk external dependencies early. If Polymarket API doesn't work as expected, we learn before building on top of it.

**Prerequisites**: None (starting from scratch)

**Deliverables:**

1. **Project Setup**:
   - Initialize TypeScript project with `pnpm init`
   - Configure `tsconfig.json` with strict type checking
   - Setup directory structure per design doc
   - Add `package.json` scripts: `dev`, `build`, `start`

2. **Dependencies Installation**:
   ```json
   {
     "dependencies": {
       "@polymarket/clob-client": "^4.22.7",
       "ethers": "^5.7.2",
       "drizzle-orm": "latest",
       "postgres": "latest",
       "zod": "latest",
       "commander": "latest",
       "pino": "latest"
     }
   }
   ```

3. **Environment Configuration**:
   - Create `.env.example` with placeholders:
     ```
     # Database
     DATABASE_URL=postgresql://user:password@host:5432/betteroms

     # Polymarket CLOB (optional in Phase 1)
     CLOB_API_URL=https://clob.polymarket.com
     CHAIN_ID=137
     ```
   - Create `.env.local` (git-ignored)
   - Update `.gitignore` to exclude `.env.local`

4. **CLOB Client Integration**:
   - Create `/integrations/polymarket/clob-client.ts`:
     ```typescript
     import { ClobClient } from '@polymarket/clob-client';
     export const clobClient = new ClobClient(host, chainId);
     ```
   - Create `/integrations/polymarket/adapter.ts` with basic wrapper methods
   - Create test script: `pnpm run test:clob-client`

5. **Basic Utilities**:
   - `/utils/logger.ts` - pino structured logging
   - `/config/env.ts` - environment variable loading with Zod validation

**Success Criteria:**
- ✅ Project builds successfully with `pnpm build`
- ✅ Can fetch order book for a known Polymarket market (e.g., "0x..." or slug)
- ✅ `getOrderBook()`, `getMidPoint()`, `getLastTradePrice()` return valid data
- ✅ Logger outputs structured JSON logs
- ✅ Environment variables load correctly

**Excluded from Phase 1:**
- Database connectivity
- CLI commands
- Trade plan validation
- Any business logic

**Estimated Effort**: 2-4 hours

---

## Phase 2 — Data Persistence Layer

**Goal**: Setup database and schema for orders, executions, and runs

**Why this phase?** Establish data layer before building business logic that depends on it.

**Prerequisites**: Phase 1 complete

**Deliverables:**

1. **Database Setup**:
   - Provision Postgres instance (Neon, Supabase, or Vercel Postgres)
   - Configure `DATABASE_URL` in `.env.local`
   - Test connection with simple query

2. **Drizzle ORM Configuration**:
   - Create `drizzle.config.ts`
   - Create `/database/index.ts` - connection client (`getDb()`)
   - Setup Drizzle Kit for migrations

3. **Schema Definition** (`/database/schema.ts`):
   - **orders table**:
     ```typescript
     id, plan_id, market_id, outcome, side, order_type,
     size, price, status, mode, created_at
     ```
   - **executions table**:
     ```typescript
     id, order_id, quantity, price, executed_at
     ```
   - **runs table**:
     ```typescript
     plan_id (PK), status, source, started_at,
     completed_at, summary_json, error_message
     ```

4. **Migrations**:
   - Generate initial migration: `pnpm drizzle-kit generate`
   - Apply migration: `pnpm drizzle-kit migrate`
   - Create `package.json` scripts: `db:generate`, `db:migrate`, `db:studio`

5. **Repository Pattern** (optional but recommended):
   - `/database/repositories/orders.repo.ts` - CRUD for orders
   - `/database/repositories/executions.repo.ts` - CRUD for executions
   - `/database/repositories/runs.repo.ts` - CRUD for runs

**Success Criteria:**
- ✅ Database connection works (`pnpm db:studio` opens Drizzle Studio)
- ✅ All 3 tables created with correct schema
- ✅ Can insert/query sample data for each table
- ✅ Migrations run successfully
- ✅ Repository methods work (if implemented)

**Excluded from Phase 2:**
- CLI commands
- Trade plan parsing
- Fill simulation logic

**Estimated Effort**: 3-5 hours

---

## Phase 3 — CLI Framework & Input Handling

**Goal**: Build CLI structure with input loading (file path and stdin support)

**Why this phase?** Establish user interaction layer before adding complex business logic.

**Prerequisites**: Phase 1 & 2 complete

**Deliverables:**

1. **Commander.js Setup** (`/cli.ts`):
   - Initialize Commander with version and description
   - Setup help text and usage examples
   - Error handling for invalid commands

2. **Commands Directory Structure**:
   - `/commands/inputLoader.ts` - load JSON from file or stdin
   - `/commands/trade.ts` - `execute:trade-plan` command handler (stub)
   - Future: `/commands/generate-creds.ts` (placeholder)

3. **Input Loader**:
   ```typescript
   // Supports:
   // 1. File path: pnpm run execute:trade-plan ./plan.json
   // 2. stdin: cat plan.json | pnpm run execute:trade-plan
   // 3. heredoc: pnpm run execute:trade-plan <<EOF ...
   async function loadInput(filePath?: string): Promise<string>
   ```

4. **Package.json Scripts**:
   ```json
   {
     "scripts": {
       "betteroms": "tsx cli.ts",
       "execute:trade-plan": "tsx cli.ts execute:trade-plan"
     }
   }
   ```

5. **Basic Command Handler**:
   - Load input via `inputLoader`
   - Parse JSON
   - Log parsed data (no validation yet)
   - Exit with status code

**Success Criteria:**
- ✅ `pnpm run betteroms --help` shows usage
- ✅ `pnpm run betteroms execute:trade-plan --help` shows command help
- ✅ Can load JSON from file: `pnpm run execute:trade-plan ./test.json`
- ✅ Can load JSON from stdin: `cat test.json | pnpm run execute:trade-plan`
- ✅ Proper error handling for missing/invalid input
- ✅ CLI exits with correct status codes (0 = success, 1 = error)

**Excluded from Phase 3:**
- Trade plan validation (just parse raw JSON)
- Trade execution
- Database writes

**Estimated Effort**: 2-3 hours

---

## Phase 4 — Trade Plan Validation

**Goal**: Implement JSON schema and Zod validation for trade plans

**Why this phase?** Fail fast on invalid input before attempting execution.

**Prerequisites**: Phase 3 complete

**Deliverables:**

1. **JSON Schema** (`/domain/schemas/trade-plan-v0.0.2.schema.json`):
   ```json
   {
     "type": "object",
     "required": ["planId", "mode", "trades"],
     "properties": {
       "planId": { "type": "string" },
       "mode": { "enum": ["paper", "live"] },
       "trades": {
         "type": "array",
         "items": {
           "required": ["marketId", "outcome", "side", "orderType", "size"],
           "properties": {
             "marketId": { "type": "string" },
             "outcome": { "enum": ["YES", "NO"] },
             "side": { "enum": ["BUY", "SELL"] },
             "orderType": { "enum": ["MARKET", "LIMIT"] },
             "size": { "type": "number", "minimum": 0 },
             "price": { "type": "number", "minimum": 0, "maximum": 1 }
           }
         }
       }
     }
   }
   ```

2. **Zod Schema** (`/domain/schemas/trade-plan.schema.ts`):
   - Mirror JSON schema in Zod
   - Conditional validation: `price` required only if `orderType === "LIMIT"`
   - Export TypeScript types: `TradePlan`, `Trade`

3. **Validation Module** (`/domain/validators/trade-plan.validator.ts`):
   - `validateTradePlan(json: unknown): TradePlan | ValidationError`
   - Detailed error messages for each validation failure
   - Market ID format detection (hex vs slug)

4. **Market ID Parsing** (`/domain/utils/market-id-parser.ts`):
   ```typescript
   function parseMarketId(input: string): {
     type: 'id' | 'slug',
     value: string
   }
   // Detect if input is hex/numeric ID or human-readable slug
   ```

5. **Integration with CLI**:
   - Update `trade.ts` to validate input before proceeding
   - Return clear validation errors to user
   - Log validation failures

**Success Criteria:**
- ✅ Valid trade plans pass validation and return typed objects
- ✅ Invalid plans fail with specific error messages
- ✅ Conditional validation works (LIMIT requires price, MARKET doesn't)
- ✅ Market ID parser correctly identifies IDs vs slugs
- ✅ CLI rejects invalid JSON with helpful errors
- ✅ TypeScript types generated from Zod schema

**Excluded from Phase 4:**
- Trade execution
- Database writes (only validation)
- Position checking for SELL orders

**Estimated Effort**: 3-4 hours

---

## Phase 5 — Paper Trading Engine (MARKET Orders Only)

**Goal**: Implement fill simulation for MARKET orders using CLOB client data

**Why this phase?** Core business logic - start with simplest order type (MARKET).

**Prerequisites**: Phase 4 complete

**Deliverables:**

1. **Executor Architecture**:
   - `/features/executor/executor-router.ts` - routes to paper vs live executor
   - `/features/executor/paper-executor.ts` - paper trading implementation
   - `/features/executor/executor.repo.ts` - database operations

2. **Fill Simulator** (`paper-executor.ts`):
   ```typescript
   async function simulateFill(trade: Trade): Promise<Execution> {
     const orderBook = await adapter.getOrderBook(trade.marketId);

     // Determine fill price
     const fillPrice = trade.side === 'BUY'
       ? orderBook.asks[0].price  // Buy at best ask
       : orderBook.bids[0].price; // Sell at best bid

     // Calculate quantity: tokens = size / price
     const quantity = trade.size / fillPrice;

     return {
       price: fillPrice,
       quantity,
       executedAt: new Date()
     };
   }
   ```

3. **SELL Order Validation**:
   - Before executing SELL, query executions table for existing position
   - Calculate net position: `SUM(quantity WHERE side='BUY') - SUM(quantity WHERE side='SELL')`
   - Error if no position exists or insufficient quantity

4. **Position Calculator** (`/features/positions/position-calculator.ts`):
   ```typescript
   async function calculatePosition(marketId: string, outcome: string): Promise<Position> {
     // Query executions table
     // Aggregate BUYs and SELLs
     // Return { netQuantity, avgPrice, unrealizedPnL }
   }
   ```

5. **Database Persistence**:
   - Insert order to `orders` table with `status: 'open'`
   - Insert execution to `executions` table
   - Update order `status: 'filled'`
   - All within transaction

6. **Integration**:
   - Wire executor into `trade.ts` command handler
   - Execute all trades in plan sequentially
   - Handle errors gracefully (fail-fast)

**Success Criteria:**
- ✅ MARKET BUY orders fill at best ask price from order book
- ✅ MARKET SELL orders fill at best bid price
- ✅ SELL orders rejected when no existing position
- ✅ Executions persisted to database with correct price/quantity
- ✅ Position calculations accurate (on-the-fly from executions)
- ✅ Can execute multi-trade plans successfully
- ✅ Database transactions work (rollback on error)

**Excluded from Phase 5:**
- LIMIT orders (future phase)
- Live trading mode
- Order cancellation
- Price guards or risk checks

**Test Scenarios**:
1. Single MARKET BUY order - should fill immediately
2. Multiple BUY orders in sequence - should create multiple executions
3. BUY followed by SELL - SELL should succeed
4. SELL without position - should fail with error
5. Invalid market ID - should fail gracefully

**Estimated Effort**: 5-7 hours

---

## Phase 6 — Orchestration & End-to-End Integration

**Goal**: Complete the system with idempotency, run summaries, and proper error handling

**Why this phase?** Ties everything together into a production-ready MVP.

**Prerequisites**: Phase 5 complete (can execute trades)

**Deliverables:**

1. **Trade Runner** (`/features/trade-runner/trade-runner.ts`):
   ```typescript
   async function executeTradePlan(plan: TradePlan): Promise<RunSummary> {
     // 1. Check idempotency (planId exists in runs?)
     // 2. Create run record (status: 'running')
     // 3. Execute each trade via executor
     // 4. Calculate final positions and P&L
     // 5. Update run record (status: 'completed', summary_json)
     // 6. Return summary
   }
   ```

2. **Idempotency Check** (US-4):
   - Query `runs` table for existing `planId`
   - If exists, reject with clear error: "Plan already executed"
   - If new, proceed with execution

3. **Run Summary Generation** (US-5):
   ```typescript
   interface RunSummary {
     planId: string;
     ordersPlaced: number;
     ordersFilled: number;
     totalPnL: number;
     positions: Position[];
     errors?: string[];
   }
   ```
   - Calculate total P&L across all executions
   - List final positions (market + outcome + quantity)
   - Store in `runs.summary_json`

4. **Output Formatting**:
   - **stdout**: Human-readable summary with colors (use `chalk` or similar)
   - **database**: Full JSON summary in `runs.summary_json`
   - Example output:
     ```
     ✓ Trade Plan: test-001
     ✓ Orders Placed: 3
     ✓ Orders Filled: 3
     ✓ Total P&L: +$45.20

     Positions:
     - Market ABC / YES: 1,250 shares @ $0.40
     - Market XYZ / NO: 833 shares @ $0.60
     ```

5. **Error Handling**:
   - Catch errors at each stage (validation, execution, persistence)
   - Log errors with pino
   - Store in `runs.error_message` if run fails
   - Exit with non-zero status code on failure
   - Rollback transactions on error

6. **Integration Tests**:
   - Test full flow: JSON input → validation → execution → summary
   - Test idempotency (run same planId twice)
   - Test error scenarios (invalid market, SELL without position, API down)
   - Test position calculations

7. **Documentation**:
   - README.md with setup instructions
   - Example trade plans in `/examples`
   - Environment variable documentation
   - Troubleshooting guide

**Success Criteria:**
- ✅ **US-1**: Can submit paper trade plan via CLI (file or stdin)
- ✅ **US-3**: Position and P&L displayed after execution
- ✅ **US-4**: Duplicate planId rejected with clear error
- ✅ **US-5**: Run summary displayed and persisted
- ✅ End-to-end: `pnpm run execute:trade-plan plan.json` works
- ✅ Errors handled gracefully with rollback
- ✅ Integration tests passing
- ✅ Documentation complete

**Final Phase 6 Test**:
Create and execute this trade plan:
```json
{
  "planId": "mvp-test-001",
  "mode": "paper",
  "trades": [
    {
      "marketId": "0x...",
      "outcome": "YES",
      "side": "BUY",
      "orderType": "MARKET",
      "size": 100
    },
    {
      "marketId": "0x...",
      "outcome": "YES",
      "side": "SELL",
      "orderType": "MARKET",
      "size": 50
    }
  ]
}
```

Expected result:
- First trade executes (BUY 100 USDC worth)
- Second trade executes (SELL 50 USDC worth of position)
- Summary shows net position and P&L
- Run persisted to database
- Re-running same planId fails

**Excluded from Phase 6:**
- LIMIT orders (future enhancement)
- Live trading mode (future phase)
- Automated scheduling (future phase)
- Order cancellation/modification
- Risk checks and price guards

**Estimated Effort**: 4-6 hours

---

## Paper Trading MVP — Complete

After Phase 6, you will have:
- ✅ Working CLI for paper trading
- ✅ CLOB client integration for market data
- ✅ Database persistence for orders, executions, runs
- ✅ Trade plan validation (JSON + Zod)
- ✅ MARKET order execution (BUY/SELL)
- ✅ Position calculation and P&L
- ✅ Idempotency protection
- ✅ Run summaries and error handling

**Total Estimated Effort**: 19-29 hours (2.5-4 days of focused work)

**Next Steps** (Future Phases):
- **Phase 7**: LIMIT order support with order book crossing logic
- **Phase 8**: Automated scheduling (hourly cron via Vercel)
- **Phase 9**: Live trading mode with wallet integration
- **Phase 10**: Order cancellation and modification
- **Phase 11**: Risk checks, price guards, position limits

---





---

### Future Phase: Automated Scheduling
- **Default**: every **60 min** (env `CRON_INTERVAL_MINUTES`) via cron or serverless scheduler
- On each run:
  - Load active JSON trade plans (filesystem directory scan, S3, or DB).
  - For each plan: validate → risk checks → execute (paper or live).
  - Run **maintenance**: cancel‑after, stale order cleanup, sync positions.
  - Emit a run report (JSON + human log).


### Future Phase: Live Trading Adapter

**Goal**: Enable real on-chain trading via Polymarket CLOB

**Implementation**: Leverage `@polymarket/clob-client` for all live trading operations (order placement already implemented). Add:
- Wallet/signer configuration using `ethers`
- API credential generation via `createOrDeriveApiKey()`
- Pre-trade validation: balance checks, token allowances
- Live executor service using `createAndPostOrder()` and `createAndPostMarketOrder()`
- Order status tracking via `getOpenOrders()` and `getTrades()`
- Add database fields: `external_order_id` and `external_execution_id` for reconciliation
- Error handling and retry logic for on-chain operations

**Key simplification**: The CLOB client handles all API complexity—authentication, order placement, cancellation, status updates. BetterOMS focuses on orchestration, validation, and persistence.

**Prerequisites**: Phase 2 complete, Polymarket credentials configured, wallet funded with USDC, token allowances set.


---


## Polymarket API Credential Setup

**Phase 1**: No credentials required (read-only public API access via CLOB client)

Future phases: Use CLOB client's built-in credential generation:
- `createOrDeriveApiKey()` - generates API credentials from wallet signature
- `deriveApiKey()` - derives credentials deterministically
- See CLOB client examples: `createApiKey.ts`, `deriveApiKey.ts`

For detailed credential setup instructions and security considerations, see [spec-credential-setup.md](spec-credential-setup.md).

---



## JSON Input

#### JSON Schema Definition
The formal schema is available at `src/domain/schemas/trade-plan-v0.0.2.schema.json` and can be referenced in JSON files via:
```json
{
  "$schema": "./src/domain/schemas/trade-plan-v0.0.2.schema.json"
}
```


### Validation
- Use **zod** for schemas; reject ill-formed plans with precise errors.
- Convert between **probability ↔ price** helpers in `utils/math.ts`.

---



## Design Decisions & FAQs

co-locate types with the feature that uses them
Avoid a giant global /types dump—except for a tiny /shared (or @types) for truly cross-cutting stuff.

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
A: **Paper trading: Use USDC collateral sizing for both BUY and SELL orders.**
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







## Persistence

BetterOMS uses Postgres with Drizzle ORM (). 

### Core Tables (All Phases)

#### orders
Tracks all order lifecycle from submission to completion.

**Purpose**: Central record of every trading order, capturing intent and current state.

**Key responsibilities**:
- Links orders to their originating trade plan via `plan_id`
- Identifies the market and outcome (YES/NO) being traded
- Stores order parameters: side (BUY/SELL), price, size (USDC collateral)
- Tracks execution mode (paper vs live) and current status (open/filled/cancelled)
- Records placement timestamp for order sequencing and auditing

**Phase-specific fields**:
- Phase 1: Basic order tracking with status transitions


#### executions
Records all fills (partial or complete) for order tracking and P&L calculation.

**Purpose**: Immutable log of every trade execution, forming the foundation for position and P&L calculations.

**Key responsibilities**:
- Links fills to their parent order via `order_id`
- Captures exact fill details: quantity filled and actual execution price
- Records execution timestamp for chronological sequencing
- Supports both paper (simulated) and live (on-chain) execution modes

**Phase-specific fields**:
- Phase 1-2: Basic fill tracking for simulated trades
- Phase 3+: Adds `external_execution_id` to map to Polymarket CLOB fill IDs for reconciliation

**Usage**:
- Phase 1 calculates positions on-the-fly by aggregating executions
- Phase 2+ uses this table to update the dedicated positions table
- Critical for P&L reporting and audit trails

**Indexes**: Optimized for queries by order and execution time.

#### execution_history
Audit trail of trade plan executions with complete context.

**Purpose**: Track each trade plan execution attempt, providing idempotency and operational visibility.

**Key responsibilities**:
- Uses `plan_id` as primary key to enforce idempotency (prevents duplicate execution)
- **Stores complete trade plan JSON** (`plan_json` field) - preserves exact input for debugging and replay
- Tracks run lifecycle: start time, completion time, current status (running/completed/failed)
- Captures run outcome in `summary_json` (orders placed, fills executed, total P&L)
- Records error details when runs fail for debugging and monitoring

**Schema fields**:
- `plan_id` (PK) - unique identifier from trade plan, idempotency key
- `plan_json` (JSONB) - complete trade plan as submitted (NEW: eliminates need for file reference)
- `status` - running | completed | failed
- `started_at` - execution start timestamp
- `completed_at` - execution completion timestamp (nullable)
- `summary_json` (JSONB) - execution results summary
- `error_message` (TEXT) - error details if failed

**Data model relationship**:
- `execution_history.plan_id` ← `orders.plan_id` (one-to-many)
- Each execution creates one history record and zero-to-many orders

**Usage**:
- Prevents accidental duplicate submissions (US-4) - query for existing `plan_id`
- Provides complete execution audit trail with original input
- Supports run summary reporting (US-5)
- Enables debugging by inspecting exact JSON that was executed
- Future: Powers operational dashboards and alerting

**Indexes**: Optimized for plan_id lookup (PK), status filtering, and time-based queries.

### Future Phase-Specific Tables

#### positions (Phase 2+)
Pre-computed position tracking for performance. Phase 1 calculates on-the-fly from executions.

**Purpose**: Maintain current position snapshot for each market+outcome combination, optimizing query performance.

**Key responsibilities**:
- Aggregates net position (quantity) across all executions for a market+outcome+mode
- Calculates weighted average entry price for position valuation
- Tracks realized P&L from closed positions
- Provides fast access to current exposure without scanning executions table

**Position state fields**:
- `qty`: Net token quantity (positive = long position, negative = short position)
- `avg_price`: Cost basis for unrealized P&L calculations
- `realized_pnl`: Locked-in profit/loss from closed trades

**Trade-offs**:
- Phase 1: Skips this table, calculates positions on-the-fly from executions (simpler, slower)
- Phase 2+: Adds dedicated table for performance (faster queries, more complex state management)

**Constraints**:
- Enforces uniqueness per (market_id, outcome, mode) combination
- Must stay synchronized with executions table updates

**Indexes**: Optimized for market-based position lookups.


### Migration Strategy
- Use Drizzle Kit for schema migrations




## Paper Trading Engine Notes (Phase 1-2)

### Data Source:
- Use `@polymarket/clob-client` methods for all market data
- `getOrderBook(tokenId)` - fetch complete order book snapshot
- `getMidPoint(tokenId)` - get market mid-price
- `getLastTradePrice(tokenId)` - recent execution reference
- **No authentication required** for read-only public endpoints in Phase 1

### Fill Simulation Logic:

**MARKET orders** (Phase 1):
```typescript
const orderBook = await clobClient.getOrderBook(marketId);
const fillPrice = side === 'BUY'
  ? orderBook.asks[0].price  // Buy at best ask
  : orderBook.bids[0].price; // Sell at best bid

// Always fill 100% immediately at best opposing price
```

**LIMIT orders** (Future):
- Check if limit price crosses current spread
- Fill immediately if executable, otherwise remain open

**SELL order validation**:
- Query executions table for existing position in market+outcome
- Error if no position exists (Phase 1 does not support short positions)

**Slippage model (Phase 1)**:
- Zero slippage - orders fill at exact best opposing price
- No price impact simulation or liquidity depth analysis
- Deterministic fills for testing/benchmarking

**Sizing**:
- Both BUY and SELL orders sized in USDC collateral
- Example: `size: 500` = $500 USDC worth of tokens
- Conversion: `tokens = size / price`

**Persistence**:
- Record simulated executions to `executions` table
- Calculate positions on-the-fly from executions (no positions table in Phase 1)
- Store identical data structure as live mode for future compatibility