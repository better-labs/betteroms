# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

BetterOMS is a lightweight, single-user order management system (OMS) for Polymarket on the Polygon network. It enables structured trading plans through JSON configuration files, supporting both paper trading (simulation) and real trading modes.

## Project Structure

The codebase is currently in early development with the following structure:

```
/src/
  /adapters/         - External API integrations (Polymarket client)
  /core/             - Core execution engines (paper vs real trading)
  /domain/           - Domain types and validation schemas
  /io/               - Input/output handling and logging
  /persistence/      - Database layer and repositories
  /rules/            - Trading rules (time expiry, price triggers)
  /utils/            - Utility functions (math, time helpers)
/docs/               - Technical specifications and documentation
```

## Technology Stack

- **Runtime**: Node.js with TypeScript, managed via `pnpm`
- **Database**: Postgres from day 1 (Vercel Postgres, Neon, or Supabase)
- **ORM**: Drizzle ORM for type-safe database access
- **Validation**: Zod schemas for JSON input validation
- **Deployment**: Vercel serverless functions
- **Local Dev**: Docker Compose for Postgres

## Development Commands

```bash
# Install dependencies
pnpm install

# Generate Polymarket API credentials (one-time setup)
pnpm run generate-creds
# Prompts for private key, outputs credentials to add to .env.local

# Run a trade plan (Phase 1)
pnpm run trade <file-path>
# Example: pnpm run trade ./plans/test.json

# Database management
pnpm run db:generate  # Generate migrations from schema
pnpm run db:migrate   # Run pending migrations
pnpm run db:studio    # Open Drizzle Studio UI

# Local development
docker-compose up -d  # Start Postgres
pnpm run dev          # Run in watch mode
```

## Core Concepts

### Phase 1 Scope (Current)
- **Paper mode only** - no real trading yet
- **Manual CLI execution** - `pnpm run trade <file-path>`
- **Simplified JSON schema** - 5 required fields only (planId, mode, trades with marketId, outcome, side, price, size)
- **3-table database** - orders, executions, runs (no positions table yet)
- **Basic fill simulation** - if limit crosses spread, fill at best price
- **No cancellations or expiry** in Phase 1

### JSON Trade Plans (Phase 1)
Minimal schema for Phase 1:
```json
{
  "planId": "2025-09-27-1200Z",
  "mode": "paper",
  "trades": [{
    "marketId": "MARKET_ID",
    "outcome": "YES",
    "side": "BUY",
    "price": 0.42,
    "size": 500
  }]
}
```

### User Stories (Phase 1)
See `docs/BetterOMS_Spec.md` for detailed user stories:
- US-1: Submit Paper Trade Plan
- US-2: Simulate Order Fill
- US-3: Track Simulated Position
- US-4: Prevent Duplicate Runs
- US-5: View Run Summary

## Database Schema (Phase 1)

**orders** - Core order tracking
- Fields: id, plan_id, market_id, outcome, side, price, size, mode, status, placed_at
- Status: 'pending' | 'open' | 'filled' | 'cancelled'

**executions** - Trade fills
- Fields: id, order_id, qty, price, mode, executed_at
- References orders.id

**runs** - Execution history
- Fields: plan_id (PK), started_at, completed_at, status, plan_file, summary_json, error_message

## Architecture Notes

- **Postgres-first**: Designed for serverless (Vercel) deployment from the start
- **No SQLite**: Serverless platforms have no persistent filesystem
- **File-based input**: Phase 1 loads JSON from file path only (no S3/DB loading)
- **Idempotency**: `planId` prevents duplicate execution
- **Position calculation**: Derived from executions table (no separate positions table in Phase 1)
- **Credential management**: Uses `.env.local` (never committed, follows Vercel convention)
- **TypeScript CLOB client**: Official `@polymarket/clob-client` for all Polymarket API interactions

## Future Phases

- Phase 2: Order cancellations, expiry, positions table, better fill simulation
- Phase 3: Real trading via Polymarket API
- Phase 4: Price guards, risk checks
- Phase 5: Delegated signer, dashboard
- Phase 6: Vercel Cron automation

## Security Considerations

- Designed with security-first approach
- Future phases will implement delegated smart contract execution
- Avoids storing private keys directly in the application
- Supports revocable allowances and spend limits