# BetterOMS

BetterOMS is a lightweight, single-user order management system (OMS) for **Polymarket** on the **Polygon** network.  
It is designed to help an individual trader define, simulate, and execute structured trading plans with safety and clarity.

To be used for both live trading and paper trading (for benchmark purposes).It accepts JSON trade plans (with a **paper vs. live** toggle), runs on an hourly cron, and executes/updates/cancels orders via Polymarket APIs.

BetterOMS is part of a suite of tools. For more context see here: https://github.com/better-labs

---

## 🎯 Purpose
Prediction markets like Polymarket allow users to bet on real-world events, but the native interfaces are geared toward manual, ad-hoc trading. BetterOMS exists to solve this gap by giving a **repeatable, rules-based execution framework** where you can:

- Define trades in **JSON** (with size, price, time-in-force, risk guards).
- Run them in **paper mode** (simulation) before committing real capital.
- Execute them safely on-chain through batch jobs, without staying online 24/7.

BetterOMS will also be a key pre-requisite for building BetterAI v2, to help automate signals generated via BetterAI Engine.




---

## 🛠️ The Problems Addressed
Many excellent prediction market tools exist to generate signals (market alpha) for trading decisions. However, the user of those systems are asked to manually execute trades based on those signals.

Typical issues traders face on Polymarket:
- Manual order entry is error-prone and time-consuming.  
- No structured way to test strategies before going live.  
- Risk of leaving funds exposed if you have to paste private keys into scripts.  
- Lack of tools for “set-and-forget” orders like *cancel after X hours* or *only buy below this price*.  

BetterOMS addresses these by:
- **Automating execution** on a schedule (e.g., hourly cron).  
- **Simulating fills** against the live order book for paper trading and benchmarking.  
- **Separating concerns**: one path for paper mode, one for real mode.  


---

## ✅ What It Does
- Accepts structured trade plans in JSON.
- Simulates or executes orders (YES/NO outcomes with BUY/SELL support).
- Supports both MARKET and LIMIT order types.
- Handles cancellations, expirations, and price guards.
- Tracks PnL and positions.
- Provides an upgrade path for secure delegated signing.  

---

## 🚀 Roadmap (Phases)
1. **Scaffolding**: Types, validation, DB, logging.  
2. **Paper Trading**: Deterministic simulator + PnL tracking.  
3. **Real Trading**: Polymarket API integration for live orders.  
4. **Controls**: Cancel-after, price triggers, risk checks.  
5. **Security & UI**: Delegate contract for signing, minimal dashboard.  

---

## Docs

Please see the /docs folder for more information.

## Phase 1 Setup (Complete ✅)

Phase 1 establishes the project foundation and validates Polymarket CLOB client integration.

### Prerequisites
- Node.js 18+ and pnpm
- No database required for Phase 1

### Setup Steps

1. **Install dependencies**
   ```bash
   pnpm install
   ```

2. **Configure environment**
   ```bash
   # .env.local is already created with defaults
   # No changes needed for Phase 1 (read-only API access)
   ```

3. **Run Phase 1 test**
   ```bash
   pnpm run test:clob-client
   ```

   This test verifies:
   - ✅ Environment variables load correctly
   - ✅ Logger outputs structured JSON logs
   - ✅ CLOB client initializes successfully
   - ✅ Can fetch market data from Polymarket API
   - ✅ All adapter methods work (getOrderBook, getMidPoint, getLastTradePrice, getSpread)

### Expected Output

The test will output structured JSON logs showing:
- Environment configuration loaded
- CLOB client initialized
- Market data fetched from Polymarket (orderbook, prices, spreads)

**Note**: Some test token IDs may be inactive and return 404 errors. This is expected. The important part is that the API calls work and return proper responses.

### Build Project

```bash
# Compile TypeScript to JavaScript
pnpm build

# Output will be in ./dist directory
```

## Phase 2 Setup (Complete ✅)

Phase 2 establishes the data persistence layer with Postgres and Drizzle ORM.

### Prerequisites
- Postgres database (we're using Supabase)
- DATABASE_URL configured in `.env.local`

### Database Commands

```bash
# Generate migrations (after schema changes)
pnpm db:generate

# Apply migrations to database
pnpm db:migrate

# Open Drizzle Studio (database GUI)
pnpm db:studio

# Test database connectivity
pnpm run test:database
```

### Run Phase 2 Test

```bash
pnpm run test:database
```

This test verifies:
- ✅ Database connection works
- ✅ All 3 tables created (execution_history, orders, executions)
- ✅ Can insert and query data
- ✅ Foreign key relationships work correctly
- ✅ Cascade delete behavior works

### Database Schema

**execution_history**: Tracks trade plan executions with complete audit trail
- Stores complete trade plan JSON for replay capability
- Uses plan_id as PK for idempotency

**orders**: Tracks all orders from submission to completion
- Links to execution_history via plan_id (cascade delete)
- Supports MARKET and LIMIT orders (Phase 5+)

**executions**: Immutable log of all order fills
- Links to orders via order_id (cascade delete)
- Foundation for position and P&L calculations

## Phase 3 Setup (Complete ✅)

Phase 3 establishes the CLI framework with Commander.js and flexible input handling.

### CLI Commands

```bash
# Show help
pnpm run betteroms --help

# Show command-specific help
pnpm run betteroms execute:trade-plan --help

# Execute trade plan from file
pnpm run execute:trade-plan ./test/trade-plans/simple-buy.json

# Execute from stdin (pipe)
cat ./test/trade-plans/simple-buy.json | pnpm run execute:trade-plan

# Execute from stdin (heredoc)
pnpm run execute:trade-plan <<EOF
{
  "planId": "test-001",
  "mode": "paper",
  "trades": [...]
}
EOF
```

### Supported Input Methods

1. **File Path**: Provide path to JSON file as argument
2. **Stdin (Pipe)**: Pipe JSON content to command
3. **Stdin (Heredoc)**: Use heredoc syntax for inline JSON

### Current Behavior (Phase 3)

The CLI currently:
- ✅ Loads and parses trade plan JSON
- ✅ Validates basic structure (planId, mode, trades)
- ✅ Displays trade plan summary
- ⏸️  Full validation will be added in Phase 4
- ⏸️  Execution logic will be added in Phase 5

### Test Trade Plans

Sample trade plans are available in `/test/trade-plans/`:
- `simple-buy.json` - Single MARKET BUY order
- `multi-trade.json` - Multiple orders (BUY and SELL)
- `invalid.json` - Invalid plan for error testing

## Next Steps

Phases 1, 2 & 3 are complete! The following phases will add:
- **Phase 4**: Trade plan validation (Zod schemas, detailed validation)
- **Phase 5**: Paper trading engine (MARKET order simulation)
- **Phase 6**: End-to-end integration and orchestration
