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
- **Cadence**: batch job (cron) ~hourly (configurable).  
- **Latency sensitivity**: low; no HFT ambitions.  
- **Out of scope (initial)**: multi‑user, cross‑venue routing, HFT/real‑time websockets, portfolio margining.

### Non‑Goals (for v0)
- Real‑time reactive strategies, co‑location, sub‑second triggers.
- Fancy UI (CLI/JSON first; optional dashboard later).

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
- **Job runner**: Serverless cron (e.g., Vercel/Cloudflare/Better Stack cron) or a lightweight container on a single VM.
- **DB**: SQLite for local/dev; Postgres (Neon) for prod.
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
    scheduler.ts               // entry point for cron batch
  /domain
    types.ts                   // Order, Market, Position, enums
    validation.ts              // zod schemas for inputs
  /io
    inputLoader.ts             // load JSON plan(s) from path/url/db
    logger.ts                  // structured logging
  /persistence
    db.ts                      // Prisma/Drizzle client
    repositories.ts            // Orders/Positions/Execs
  /rules
    timeExpiry.ts              // cancel-after, good-til time
    priceTriggers.ts           // simple stop/take-profit (phase 2)
  /utils
    math.ts                    // odds/price conversions
    clock.ts                   // time helpers
/index.ts                      // CLI/local runner
```

Pros:
- Clear seams (adapter/core/domain) => easy to test & swap (paper vs real).
- Rules isolated for incremental feature add.

---

## JSON Input (v0)
Single file can contain one or more **trade intents**.

```jsonc
{
  "runId": "2025-09-27-1200Z",
  "mode": "paper", // "paper" | "real"
  "defaults": {
    "maxNotionalUSD": 2000,
    "goodForSeconds": 10800 // 3h
  },
  "trades": [
    {
      "marketId": "MARKET_ID_OR_SLUG",
      "outcome": "YES",            // "YES" | "NO"
      "side": "BUY",               // "BUY" | "SELL"
      "type": "LIMIT",             // only LIMIT in v0
      "price": 0.42,               // 0..1 (cents/100)
      "size": 500,                 // in collateral units (USDC)
      "timeInForce": "GTT",        // GTT|GTC (GTT honored via cancel-after)
      "cancelAfterSec": 7200,      // override defaults.goodForSeconds
      "priceCeil": 0.45,           // OPTIONAL: do not buy if mid > ceil
      "priceFloor": 0.38,          // OPTIONAL: do not sell if mid < floor
      "notes": "enter on dip"
    }
  ]
}
```

### Validation
- Use **zod** for schemas; reject ill-formed plans with precise errors.
- Convert between **probability ↔ price** helpers in `utils/math.ts`.

---

## Core Features (MVP → Phase 2)
### MVP (Phase 1–2)
- Parse & validate JSON plans.
- **Paper vs Real** switch via `mode`.
- Limit order placement for YES/NO outcomes.
- Cancel‑after (time‑based) for GTT orders.
- Position/PNL tracking (average cost, realized/unrealized).
- Idempotency: `runId` to avoid duplicate submissions.

### Phase 2 (Quality & Controls)
- **Price guards** (ceil/floor) at submit time.
- Simple **stop loss / take profit**: cancel+replace logic on next batch tick.
- Retry policy with exponential backoff; dead‑letter for permanently failed ops.
- Per‑run risk checks: max notional, max orders, venue heartbeat.

### Phase 3 (Security & UX)
- **Delegated signer** on Polygon (revocable) to avoid storing private keys.
- Minimal React dashboard: runs, open orders, fills, PnL, logs.
- Backtesting harness (replay books; see Paper Engine).

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
- **Default**: every **60 min** (env `CRON_INTERVAL_MINUTES`).
- On each run:
  - Load active JSON trade plans (file path, S3, or DB).
  - For each plan: validate → risk checks → execute (paper or real).
  - Run **maintenance**: cancel‑after, stale order cleanup, sync positions.
  - Emit a run report (JSON + human log).

---

## Persistence (sketch)
- **orders**(id, run_id, market_id, outcome, side, type, price, size, mode, status, placed_at, cancel_after, notes)
- **executions**(id, order_id, qty, price, ts, mode)
- **positions**(market_id, outcome, qty, avg_price, realized_pnl, unrealized_pnl_ts, mode)
- **runs**(run_id, started_at, completed_at, status, summary_json)
- **audit_logs**(ts, level, msg, context_json)

Use Drizzle or Prisma; add composite indexes on `(market_id, status)` and `(run_id)`.

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
1. **Phase 1 — Scaffolding & Types (Easy)**  
   Project setup, domain types, input validation, DB schema, logging.
2. **Phase 2 — Paper Engine (Easy→Medium)**  
   Deterministic fills, PnL/positions, reports.
3. **Phase 3 — Real Trading Adapter (Hardest)**  
   Polymarket API integration, approvals, error handling, idempotency.
4. **Phase 4 — Controls & Triggers (Medium)**  
   Cancel‑after, price guards, simple stops/takes; retry & DLQ.
5. **Phase 5 — Security & Dashboard (Medium)**  
   Delegate executor on Polygon; minimal React UI.

---

## Nice‑to‑Haves (Later)
- Backtest runner that replays historical books (or mid/close prices) for plan evaluation.
- Strategy library (e.g., “enter on dip”, “fade spike”, “mean reversion”).
- Alerting (webhooks/Slack) on fills, breaches, or errors.
- Multi‑plan orchestration with priorities and capital budgeting.

---

## Open Questions / TODO
- Pin down Polymarket endpoints & auth model; finalize adapter contracts.
- Decide paper engine’s liquidity assumptions per market category.
- Confirm USDC decimals/allowances on Polygon and token addresses.
- Design the Delegate Executor’s on‑chain guards (venue allow‑list, caps).
- Define reporting format for run summaries (human + JSON).
```

with these edits: 
- Email send removed; this doc is saved as a file for download.
- Email address acknowledged: wesfloyd@gmail.com (corrected).

