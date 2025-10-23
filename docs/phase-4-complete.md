# Phase 4 Complete - Trade Plan Validation

## Overview
Phase 4 has been successfully implemented, adding comprehensive JSON schema validation to the BetterOMS CLI.

## Implemented Components

### 1. Zod Schema with TypeScript Types (Single Source of Truth)
**File**: [src/domain/schemas/trade-plan.schema.ts](../src/domain/schemas/trade-plan.schema.ts)
- Runtime validation using Zod
- Exported TypeScript types: `TradePlan`, `Trade`, `Outcome`, `Side`, `OrderType`, `Mode`
- Custom error messages for all validation rules
- Conditional validation: price required when orderType is LIMIT
- Schema version constant: `TRADE_PLAN_SCHEMA_VERSION = 'v0.0.4'`

### 2. Auto-Generated JSON Schema for External Users
**File**: [docs/schemas/trade-plan-v0.0.4.schema.json](../docs/schemas/trade-plan-v0.0.4.schema.json)
- Auto-generated from Zod schema (single source of truth)
- Formal JSON Schema Draft-07 specification
- Can be referenced in external JSON files via `$schema` property
- Regenerated automatically on build via `pnpm schema:generate`
- **URL**: `https://raw.githubusercontent.com/wesfloyd/betteroms/main/docs/schemas/trade-plan-v0.0.4.schema.json`

### 3. Schema Generator Script
**File**: [scripts/generate-json-schema.ts](../scripts/generate-json-schema.ts)
- Converts Zod schema to JSON Schema using `zod-to-json-schema`
- Adds version metadata and custom descriptions
- Integrated into build process (`pnpm build` runs `schema:generate` first)
- Ensures Zod and JSON Schema never drift out of sync

### 4. Market ID Parser
**File**: [src/domain/utils/market-id-parser.ts](../src/domain/utils/market-id-parser.ts)
- Detects market ID format: hex ID (0x...) vs human-readable slug
- Validates market ID format rules:
  - Hex IDs: starts with `0x` or all hexadecimal characters
  - Slugs: lowercase letters, numbers, and hyphens only
- Returns parsed type (`id` or `slug`) for future API resolution

### 4. Domain Error Classes
**Files**:
- [src/domain/errors/base.error.ts](../src/domain/errors/base.error.ts) - Base `AppError` class
- [src/domain/errors/validation.error.ts](../src/domain/errors/validation.error.ts) - `ValidationError` with field-level details
- [src/domain/errors/execution.error.ts](../src/domain/errors/execution.error.ts) - Future execution errors

**Features**:
- Structured error handling with `isOperational` flag
- Field-level validation errors with path and message
- `ValidationError.fromZodError()` - converts Zod errors to domain errors
- `getSummary()` - human-readable error output for CLI

### 5. Validation Module
**File**: [src/domain/validators/trade-plan.validator.ts](../src/domain/validators/trade-plan.validator.ts)
- `validateTradePlan(input)` - validates and returns typed TradePlan object
- `safeValidateTradePlan(input)` - returns result object instead of throwing
- Validates market IDs for all trades
- Comprehensive error messages with field paths

### 6. CLI Integration
**File**: [src/cli/commands/trade.command.ts](../src/cli/commands/trade.command.ts)
- Updated to use validation module
- Displays detailed validation errors with field paths
- Proper exit codes: 0 for success, 1 for validation failure
- Shows validation summary in user-friendly format

## Test Results

### Valid Trade Plans (All Pass ✅)

1. **Simple MARKET order**
   ```bash
   pnpm run execute:trade-plan ./test/trade-plans/valid-simple.json
   ```
   - Exit code: 0
   - 1 trade validated successfully

2. **Multi-trade plan with hex ID and slug**
   ```bash
   pnpm run execute:trade-plan ./test/trade-plans/valid-multi.json
   ```
   - Exit code: 0
   - 3 trades validated (mix of hex IDs and slugs)

3. **LIMIT order with price**
   ```bash
   pnpm run execute:trade-plan ./test/trade-plans/valid-limit-order.json
   ```
   - Exit code: 0
   - LIMIT order with price field validated

### Invalid Trade Plans (All Fail ❌ as Expected)

4. **Missing required fields**
   ```bash
   pnpm run execute:trade-plan ./test/trade-plans/invalid-missing-fields.json
   ```
   - Exit code: 1
   - Error: "trades: Required"

5. **Wrong data types**
   ```bash
   pnpm run execute:trade-plan ./test/trade-plans/invalid-wrong-types.json
   ```
   - Exit code: 1
   - Errors: Invalid outcome ("MAYBE"), invalid size (string instead of number)

6. **LIMIT order missing price**
   ```bash
   pnpm run execute:trade-plan ./test/trade-plans/invalid-limit-no-price.json
   ```
   - Exit code: 1
   - Error: "Price is required for LIMIT orders"

7. **Invalid market ID format**
   ```bash
   pnpm run execute:trade-plan ./test/trade-plans/invalid-bad-market-id.json
   ```
   - Exit code: 1
   - Error: "Market slug must contain only lowercase letters, numbers, and hyphens"

### Input Methods (All Work ✅)

8. **File input**
   ```bash
   pnpm run execute:trade-plan ./test/trade-plans/valid-simple.json
   ```
   - Works correctly

9. **Stdin (pipe)**
   ```bash
   cat ./test/trade-plans/valid-simple.json | pnpm run execute:trade-plan
   ```
   - Works correctly

10. **Stdin (heredoc)**
    ```bash
    pnpm run execute:trade-plan <<EOF
    {"planId":"heredoc-test-001","mode":"paper","trades":[...]}
    EOF
    ```
    - Works correctly

## Success Criteria - All Met ✅

- ✅ Valid trade plans pass validation and return typed objects
- ✅ Invalid plans fail with specific error messages
- ✅ Conditional validation works (LIMIT requires price, MARKET doesn't)
- ✅ Market ID parser correctly identifies IDs vs slugs
- ✅ CLI rejects invalid JSON with helpful errors
- ✅ TypeScript types generated from Zod schema
- ✅ Exit codes work correctly (0 = success, 1 = error)
- ✅ All input methods work (file, stdin pipe, heredoc)
- ✅ **Single source of truth**: Zod schema auto-generates JSON Schema
- ✅ **External users**: Can reference JSON Schema for IDE autocomplete

## Files Created

### Domain Layer
- `src/domain/schemas/trade-plan.schema.ts` - Zod schema with types (v0.0.4, single source of truth)
- `src/domain/utils/market-id-parser.ts` - Market ID parsing logic
- `src/domain/validators/trade-plan.validator.ts` - Validation module
- `src/domain/errors/base.error.ts` - Base error class
- `src/domain/errors/validation.error.ts` - Validation error class
- `src/domain/errors/execution.error.ts` - Execution error classes

### Schema Generation
- `scripts/generate-json-schema.ts` - Auto-generates JSON Schema from Zod
- `docs/schemas/trade-plan-v0.0.4.schema.json` - Auto-generated JSON Schema for external users

### Test Files
- `test/trade-plans/valid-simple.json` - Simple MARKET order
- `test/trade-plans/valid-multi.json` - Multi-trade with hex ID and slug
- `test/trade-plans/valid-limit-order.json` - LIMIT order with price
- `test/trade-plans/invalid-missing-fields.json` - Missing trades array
- `test/trade-plans/invalid-wrong-types.json` - Wrong data types
- `test/trade-plans/invalid-limit-no-price.json` - LIMIT without price
- `test/trade-plans/invalid-bad-market-id.json` - Invalid market ID format

### Documentation
- `docs/phase-4-complete.md` - This file
- `docs/trade-plan-schema.md` - External user documentation for JSON Schema

## Files Modified
- `src/cli/commands/trade.command.ts` - Integrated validation
- `package.json` - Added `schema:generate` script, updated build process

## Files Deleted
- `src/domain/schemas/trade-plan-v0.0.2.schema.json` - Replaced by auto-generated schema

## Next Steps - Phase 5

Phase 5 will implement the paper trading engine:
1. Create executor architecture (service, paper executor, repository)
2. Implement fill simulator for MARKET orders
3. Add SELL order position validation
4. Create position calculator
5. Add database persistence for orders and executions
6. Test end-to-end trade execution

**Estimated Effort**: 5-7 hours

---

**Phase 4 Status**: ✅ COMPLETE
**Date**: 2025-10-22
**Total Time**: ~3 hours
