# BetterOMS — Single‑User Order Management System for Polymarket (Polygon)

(as of 9/29)

## TL;DR
A single‑user, batch‑executed trading orchestration tool for Polymarket on Polygon. It accepts JSON trade plans (with a **paper vs. real** toggle), runs on an hourly cron, and executes/updates/cancels orders via Polymarket APIs. Future phases add price triggers, expirations, and (optional) delegated smart‑contract signing to avoid handling raw private keys.

---

## Scope & Goals
- **User**: one operator (you).
- **Exchanges**: **Polymarket** (Polygon).
- **Order types**: YES/NO outcome orders via **limit** orders (bid/ask); marketable limit supported by setting price to cross the spread.
- **Modes**: **paper** (simulate) and **real** (on‑chain via Polymarket APIs).
- **Cadence**: Phase 1 manual CLI; later phases add hourly cron.
- **Latency sensitivity**: low; no HFT ambitions.
- **Out of scope (initial)**: multi‑user, cross‑venue routing, HFT/real‑time websockets, portfolio margining.

### Non‑Goals (for v0)
- Real‑time reactive strategies, co‑location, sub‑second triggers.
- Fancy UI (CLI/JSON first; optional dashboard later).

---

## User Stories (Phase 1)

### US-0: Configure Account Credentials
**As a** trader
**I want to** configure my Polymarket credentials with BetterOMS
**So that** the system can fetch market data and (in future phases) execute real trades

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
- Real trading (Phase 3) will require full API credentials

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
- JSON validated against Phase 1 schema (runId, mode, trades array)
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
- System checks if `runId` already exists in `runs` table
- If duplicate detected, reject with clear error message
- If new runId, proceed with execution

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
Given I've run plan with runId "test-001"
When I try to run same plan with runId "test-001" again
Then system should reject with error "runId already exists"
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
- **Batch Runner**: Invoked hourly; parses input plans, decides paper vs. real, and calls the appropriate executor.
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
- **Key mgmt (v1)**: env‑scoped private key in secure secret store (**only if you must**).
- **Key mgmt (v2)**: **Delegated smart‑contract executor** on Polygon with revocable allowances (see Security).

---

## Project Layout (TypeScript)
```
/src
  /adapters
    polymarketClient.ts        // REST/WS calls, auth, retries
  /core
    executor.ts                // routes to paper vs real
    paperEngine.ts             // fill simulation
    realEngine.ts              // on-chain execution via adapter
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
- Phase 3+ only (real trading)
- Approves USDC and CTF tokens to Polymarket exchange
- One-time setup per wallet
- Not needed for Phase 1 paper trading

Pros:
- Clear seams (adapter/core/domain) => easy to test & swap (paper vs real).
- Rules isolated for incremental feature add.
- Scripts directory for CLI utilities (generate-creds, future: market-lookup, etc.)

---

## JSON Input

### Phase 1 (Simplified Schema)
Minimal required fields only - no optional features, no defaults section.

```jsonc
{
  "runId": "2025-09-27-1200Z",
  "mode": "paper",              // "paper" only in Phase 1
  "trades": [
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

**Phase 1 constraints:**
- `mode`: Must be "paper" (real trading in Phase 3)
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
  "runId": "2025-09-27-1200Z",
  "mode": "paper",
  "defaults": {
    "maxNotionalUSD": 2000,
    "goodForSeconds": 10800     // 3h
  },
  "trades": [
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

## Core Features by Phase

### Phase 1 (Minimal Viable Product)
- Parse & validate simplified JSON plans (5 required fields only)
- **Paper mode only** (no real trading yet)
- **BUY orders only** (SELL orders in Phase 2+)
- Limit order placement for YES/NO outcomes
- Order sizing in USDC collateral (e.g., "buy $500 of YES @ 0.42")
- Basic fill simulation against order book snapshot
- Persist orders, executions, runs to Postgres
- Calculate P&L on-the-fly from executions
- Idempotency: `runId` to avoid duplicate submissions
- CLI invocation: `pnpm run trade <file-path>`
- Fail-fast error handling (no retry queues)
- Sequential execution (one plan at a time)

**Phase 1 explicitly excludes:**
- SELL orders (requires token quantity management)
- Order cancellations and expiry
- Price guards (ceil/floor)
- Risk checks
- Real trading mode
- Automated scheduling
- Concurrent plan execution

### Phase 2 (Paper Trading Quality)
- **SELL orders** with token quantity sizing
- Cancel‑after (time‑based) for GTT orders
- Position/PNL tracking with dedicated `positions` table
- Better fill simulation with slippage modeling
- Run reports with detailed P&L breakdown
- Helper utilities: USDC ↔ token quantity conversion

### Phase 3 (Quality & Controls)
- **Price guards** (ceil/floor) at submit time
- Simple **stop loss / take profit**: cancel+replace logic
- Retry policy with exponential backoff
- Per‑run risk checks: max notional, max orders, venue heartbeat

### Phase 4 (Security & UX)
- **Delegated signer** on Polygon (revocable) to avoid storing private keys
- Minimal React dashboard: runs, open orders, fills, PnL, logs
- Backtesting harness (replay books)

---

## Paper Trading Engine (v0)
- Pull latest **order book snapshot** / last trade for each market at batch time.
- Fill logic:
  1. If limit price **crosses or equals** opposing best, assume immediate fill up to available size (cap to configured liquidity assumption).
  2. Otherwise, leave as **resting order** in simulated book until a future run where crossing occurs (based on new snapshot).
- Slippage model: simple (best + tick); configurable spread cushion.
- Record simulated executions and positions identically to real mode.

*Note*: Deterministic by seeding with `runId` + marketId for repeatable tests.

---

## Real Trading Flow (v1)
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
  - Execute trades (paper or real mode)
  - Emit run report (JSON + human log)

### Phase 2+ (Automated Scheduling)
- **Default**: every **60 min** (env `CRON_INTERVAL_MINUTES`) via cron or serverless scheduler
- On each run:
  - Load active JSON trade plans (filesystem directory scan, S3, or DB).
  - For each plan: validate → risk checks → execute (paper or real).
  - Run **maintenance**: cancel‑after, stale order cleanup, sync positions.
  - Emit a run report (JSON + human log).

---

## Persistence

### Phase 1 (Simplified Schema - 3 Tables)
Start with minimal tables; derive positions from executions rather than maintaining separate table.

**orders**
```sql
CREATE TABLE orders (
  id UUID PRIMARY KEY,
  run_id VARCHAR(255) NOT NULL,
  market_id VARCHAR(255) NOT NULL,
  outcome VARCHAR(10) NOT NULL,      -- 'YES' | 'NO'
  side VARCHAR(10) NOT NULL,         -- 'BUY' | 'SELL'
  price DECIMAL(10,4) NOT NULL,      -- 0.0000 to 1.0000
  size DECIMAL(18,6) NOT NULL,       -- USDC amount
  mode VARCHAR(10) NOT NULL,         -- 'paper' | 'real'
  status VARCHAR(20) NOT NULL,       -- 'pending' | 'open' | 'filled' | 'cancelled'
  placed_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_orders_run_id ON orders(run_id);
CREATE INDEX idx_orders_market_status ON orders(market_id, status);
```

**executions**
```sql
CREATE TABLE executions (
  id UUID PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES orders(id),
  qty DECIMAL(18,6) NOT NULL,        -- filled quantity
  price DECIMAL(10,4) NOT NULL,      -- fill price
  mode VARCHAR(10) NOT NULL,         -- 'paper' | 'real'
  executed_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_executions_order_id ON executions(order_id);
```

**runs**
```sql
CREATE TABLE runs (
  run_id VARCHAR(255) PRIMARY KEY,
  started_at TIMESTAMP NOT NULL,
  completed_at TIMESTAMP,
  status VARCHAR(20) NOT NULL,       -- 'running' | 'completed' | 'failed'
  plan_file VARCHAR(500),            -- path to input JSON
  summary_json JSONB,                -- results summary
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
```

**Phase 1 notes:**
- No `positions` table - calculate on-the-fly from executions
- No `audit_logs` table - use stdout/file logging initially
- No `cancel_after`, `notes`, or advanced fields on orders
- Use Drizzle ORM with Postgres (Vercel Postgres or Neon)

### Phase 2+ (Full Schema)
Add back:
- **positions** table for performance (pre-computed P&L)
- **audit_logs** for structured event tracking
- Additional order fields: `cancel_after`, `price_ceil`, `price_floor`, `notes`

---

## Security Model
- **v1**: If using a private key, store in a dedicated secrets manager; never log it; restrict wallet to minimal funds.
- **v2 (preferred)**: Deploy a **Delegate Executor** contract on Polygon:
  - User submits **Approve** transactions for USDC/outcome tokens with **spend limits** to the executor.
  - Executor enforces **allow‑list of venues/actions** (e.g., Polymarket CLOB) and **per‑tx caps**.
  - Permissions are **revocable**; allowances can be reduced to zero.
- Always provide a **dry‑run preview** (paper) before enabling real mode.

---

## Phase Plan & Difficulty

### Phase 1 — Paper Trading MVP (Easy→Medium)
**Goal**: Validate core concept with minimal scope

**Deliverables:**
- TypeScript project setup with `pnpm`
- Environment variable configuration (`.env.local` file with optional Polymarket credentials)
- Credential generation script: `pnpm run generate-creds`
- Simplified JSON schema (5 required fields)
- Zod validation for trade plans
- Postgres database with 3 tables (orders, executions, runs)
- Drizzle ORM setup
- Basic paper trading engine (immediate fill logic only)
- CLI entry point: `pnpm run trade <file-path>`
- Position calculation from executions
- Run summary output (stdout + DB)
- Local development with Docker Compose (Postgres)
- Documentation for credential setup (optional in Phase 1)

**Constraints:**
- Paper mode only (no real trading)
- No order cancellations or expiry
- No price guards or risk checks
- File-based input only (no S3/DB loading)
- Manual execution (no cron)
- Simple fill logic (if limit crosses spread, fill at best price)

**Success Criteria:**
- All 5 user stories implemented
- All 5 test scenarios passing
- Can run `pnpm run trade plan.json` and see results
- Database persists orders, executions, runs correctly

---

### Phase 2 — Paper Trading Quality (Medium)
- Cancel‑after (time‑based) for GTT orders
- Position/PNL tracking with dedicated `positions` table
- Better fill simulation with slippage modeling
- Detailed run reports with P&L breakdown
- Add `defaults` section to JSON schema

### Phase 3 — Real Trading Adapter (Hardest)
- Polymarket API integration (markets, orders, status)
- Real mode execution via Polymarket CLOB
- Wallet approvals and balance checks
- Error handling and retry logic
- Idempotency for on-chain operations

### Phase 4 — Controls & Triggers (Medium)
- Price guards (ceil/floor) at submit time
- Simple stop loss / take profit
- Risk checks: max notional, max orders
- Retry policy with exponential backoff

### Phase 5 — Security & Dashboard (Medium)
- Delegated signer on Polygon (revocable)
- Minimal React dashboard
- Backtesting harness

### Phase 6 — Automation (Medium)
- Vercel Cron for scheduled execution
- Multi-file loading
- S3/DB-backed plan storage

---

## Nice‑to‑Haves (Later)
- Backtest runner that replays historical books (or mid/close prices) for plan evaluation.
- Strategy library (e.g., “enter on dip”, “fade spike”, “mean reversion”).
- Alerting (webhooks/Slack) on fills, breaches, or errors.
- Multi‑plan orchestration with priorities and capital budgeting.

---

## Polymarket API Credential Setup

BetterOMS supports **API-only signup** via the EOA (Externally Owned Account) path - no website interaction required.

### EOA Quickstart (API-Only, No Website)

```bash
# 1. Install dependencies
pnpm install

# 2. Generate API credentials (bootstraps your account)
pnpm run generate-creds
# → Signs EIP-712 message with your wallet
# → Sends to POST /auth/api-key endpoint
# → Outputs credentials for .env.local

# 3. (Phase 3+) Fund wallet & set allowances
pnpm run set-allowances
# → Approves USDC and CTF tokens on-chain

# 4. Start trading
pnpm run trade ./plans/my-trade.json
```

**What This Does:**
- ✅ Creates API credentials using only your private key (no website)
- ✅ Registers your wallet with Polymarket CLOB backend
- ✅ Your EOA address becomes the funder (holds funds + positions)
- ✅ L2 HMAC authentication for all trading requests (no wallet popups)

---

### Prerequisites
- Polygon wallet with private key (EOA)
- USDC on Polygon (for real trading in Phase 3+)
- No Polymarket.com account needed for API-only path

### EOA (Externally Owned Account) Approach

BetterOMS uses the **EOA path** exclusively:
- You control the private key directly (MetaMask, hardware wallet, etc.)
- No website signup required - API-only bootstrap
- Your wallet address holds funds and signs all transactions
- Requires one-time token approvals (USDC + conditional tokens)
- Full control over your wallet and funds

**Note:** Polymarket also supports proxy wallets (website-created multisigs), but BetterOMS does not use this approach.

---

### Step 1: Obtain Your Private Key

Use any Polygon-compatible wallet:
- **MetaMask**: Export private key from account details
- **Hardware wallet**: Ledger, Trezor, etc.
- **Programmatic**: Generate with `ethers` or web3 library
- Your private key = your signing key = your funder address

**Security Note:** This key controls your wallet funds - treat as highly sensitive. Never share or commit to version control.

### Step 2: Generate API Credentials (API-Only Signup)

This step **bootstraps your account** with Polymarket's backend using only your private key - no website signup required.

**Automated Setup (Recommended)**

BetterOMS includes a built-in script to generate credentials:

```bash
# Install dependencies first
pnpm install

# Run the credential generation script (EOA signup)
pnpm run generate-creds
```

This script performs **API-only signup** by:
1. Reading your private key from `.env.local` (or prompting)
2. Signing an EIP-712 authentication message (L1 signature)
3. Sending signature to `POST /auth/api-key` endpoint
4. Receiving deterministic API credentials (key, secret, passphrase)
5. Outputting credentials to add to `.env.local`

**What Happens Under the Hood:**
- Your wallet signature is used "as a seed" to deterministically generate credentials
- Same private key always generates same API credentials
- This registers your wallet with Polymarket's CLOB backend
- No proxy wallet created - your EOA is the funder

**Manual Implementation**

The credential generation uses the official TypeScript CLOB client:

```typescript
// scripts/generate-credentials.ts
import 'dotenv/config';
import { Wallet } from 'ethers';
import { ClobClient, type ApiKeyCreds } from '@polymarket/clob-client';

const HOST = 'https://clob.polymarket.com';
const CHAIN_ID = 137; // Polygon Mainnet
const SIGNATURE_TYPE = 2; // 0=browser wallet, 1=email/magic, 2=EOA

async function generateCredentials() {
  // Read private key from .env.local or prompt user
  const privateKey = process.env.POLYMARKET_PRIVATE_KEY;

  if (!privateKey) {
    throw new Error('Missing POLYMARKET_PRIVATE_KEY in .env.local');
  }

  // Create ethers wallet from private key (EOA)
  const wallet = new Wallet(privateKey);

  console.log(`\n🔑 Wallet Address: ${wallet.address}`);
  console.log('This address will be your funder (holds USDC and positions)\n');

  // Generate API credentials via L1 signature (API-only signup)
  // createOrDeriveApiKey() is idempotent - same key = same creds
  console.log('Signing EIP-712 message for API key generation...');
  const credsPromise: Promise<ApiKeyCreds> =
    new ClobClient(HOST, CHAIN_ID, wallet).createOrDeriveApiKey();

  const creds = await credsPromise;

  console.log('\n✅ API Credentials Generated (Account Bootstrapped)!\n');
  console.log('Add these to your .env.local file:\n');
  console.log(`POLYMARKET_PRIVATE_KEY=${privateKey}`);
  console.log(`POLYMARKET_API_KEY=${creds.apiKey}`);
  console.log(`POLYMARKET_API_SECRET=${creds.apiSecret}`);
  console.log(`POLYMARKET_API_PASSPHRASE=${creds.apiPassphrase}`);
  console.log(`POLYMARKET_SIGNATURE_TYPE=${SIGNATURE_TYPE}  # 2=EOA`);

  console.log('\n⚠️  Keep these credentials secure - never commit to git!\n');

  // Check access status (geo restrictions, etc.)
  console.log('Checking API access status...');
  const client = new ClobClient(
    HOST,
    CHAIN_ID,
    wallet,
    creds,
    SIGNATURE_TYPE
  );
  const access = await client.getAccessStatus();
  console.log('Access status:', access);

  console.log('\n📝 Next steps:');
  console.log(`   1. Fund ${wallet.address} with USDC on Polygon`);
  console.log(`   2. Set token allowances (run: pnpm run set-allowances)`);
  console.log(`   3. Start trading!\n`);
}

generateCredentials().catch(console.error);
```

**Dependencies:**
```json
{
  "dependencies": {
    "@polymarket/clob-client": "^latest",
    "ethers": "^6.x",
    "dotenv": "^latest"
  }
}
```

**How It Works:**
- API credentials are deterministically derived from your private key signature
- Same private key always generates same credentials
- Credentials grant access to trading APIs without exposing private key in every request
- See [Polymarket Authentication Docs](https://docs.polymarket.com/developers/CLOB/authentication) for details

### Step 3: Fund Your Wallet & Set Allowances (Phase 3+ Only)

**For Phase 1 (Paper Trading):** Skip this step - no funding required.

**For Phase 3+ (Real Trading):** EOA wallets must be funded and approve token transfers.

#### 3a. Fund Wallet with USDC
```bash
# Send USDC to your wallet address on Polygon
# You can bridge from Ethereum or buy directly on Polygon
# Address: (output from generate-creds script)
```

#### 3b. Set Token Allowances (One-Time Setup)

EOA wallets must approve two token types:
1. **USDC** - For placing buy orders
2. **Conditional Tokens (CTF)** - For placing sell orders (received from fills)

BetterOMS will include a helper script:
```bash
# Approve USDC and CTF tokens to Polymarket exchange contracts
pnpm run set-allowances

# This sends on-chain transactions:
# - USDC.approve(exchangeAddress, MAX_UINT256)
# - CTF.setApprovalForAll(exchangeAddress, true)
```

**Why Required:**
- Proxy wallet users don't need this (handled by smart contract)
- EOA users must explicitly approve contracts to spend tokens
- One-time setup - approvals persist until revoked

**Contracts to Approve:**
- Exchange: `0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E` (Polygon)
- CTF: `0x4D97DCd97eC945f40cF65F87097ACe5EA0476045` (Polygon)

---

### Step 4: Configure BetterOMS

Create `.env.local` file in project root:
```bash
# Polygon wallet private key (REQUIRED for Phase 3+, optional for Phase 1)
POLYMARKET_PRIVATE_KEY=your_private_key_without_0x_prefix

# API credentials (REQUIRED for Phase 3+, optional for Phase 1)
# Generate these by running: pnpm run generate-creds
POLYMARKET_API_KEY=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
POLYMARKET_API_SECRET=your_api_secret_here
POLYMARKET_API_PASSPHRASE=your_api_passphrase_here
POLYMARKET_SIGNATURE_TYPE=2  # 0=browser, 1=email/magic, 2=EOA

# Database connection (REQUIRED)
DATABASE_URL=postgresql://user:password@localhost:5432/betteroms
```

### Security Best Practices
1. **Never commit `.env.local` file** - verify it's in `.gitignore`
2. **Use dedicated trading wallet** with limited funds for testing
3. **Rotate credentials** if compromised (re-run `pnpm run generate-creds`)
4. **Phase 5 upgrade path**: Implement delegated signer contract to avoid handling raw private keys
5. **Store production secrets** in secure secret manager (Vercel Env Vars, AWS Secrets Manager, etc.)
6. **Why `.env.local`**: Follows Next.js/Vercel convention - never committed, local-only secrets

### Phase 1 vs Phase 3 Requirements

| Feature | Phase 1 (Paper Mode) | Phase 3+ (Real Trading) |
|---------|----------------------|-------------------------|
| Private Key | Optional* | **Required** |
| API Credentials | Optional* | **Required** |
| Market Data Access | Public endpoints | Authenticated endpoints |
| Order Placement | Simulated (no API calls) | Real (CLOB API) |

*Phase 1 can use public market data APIs that don't require authentication, but having credentials configured enables testing the full authentication flow.

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

---

## Open Questions / TODO
- Pin down Polymarket endpoints & auth model for Phase 3 (real trading).
- Decide paper engine's liquidity assumptions per market category.
- Confirm USDC decimals/allowances on Polygon and token addresses.
- Design the Delegate Executor's on‑chain guards (venue allow‑list, caps).
- Define reporting format for run summaries (human + JSON).

