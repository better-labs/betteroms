# Trade Plan JSON Schema

## Overview

BetterOMS uses JSON files to define trade plans. This document describes the schema format for external users.

## Current Version: v0.0.4

**JSON Schema URL**: `https://raw.githubusercontent.com/wesfloyd/betteroms/main/docs/schemas/trade-plan-v0.0.4.schema.json`

## Using the Schema

### Option 1: Reference in Your JSON Files (Recommended)

Add the `$schema` property to get IDE autocomplete and validation:

```json
{
  "$schema": "https://raw.githubusercontent.com/wesfloyd/betteroms/main/docs/schemas/trade-plan-v0.0.4.schema.json",
  "planId": "my-trade-001",
  "mode": "paper",
  "trades": [
    {
      "marketId": "0x1234567890abcdef1234567890abcdef12345678",
      "outcome": "YES",
      "side": "BUY",
      "orderType": "MARKET",
      "size": 100
    }
  ]
}
```

**Benefits**:
- ✅ VSCode/IDEs provide autocomplete
- ✅ Real-time validation as you type
- ✅ Inline error messages

### Option 2: Validate Programmatically

If you're generating trade plans programmatically, validate against the schema:

```javascript
import Ajv from 'ajv';

const ajv = new Ajv();
const schema = await fetch('https://raw.githubusercontent.com/wesfloyd/betteroms/main/docs/schemas/trade-plan-v0.0.4.schema.json')
  .then(res => res.json());

const validate = ajv.compile(schema);
const valid = validate(tradePlanData);

if (!valid) {
  console.error(validate.errors);
}
```

## Schema Structure

### Root Object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `planId` | `string` | ✅ Yes | Unique identifier for this trade plan (alphanumeric, hyphens, underscores only) |
| `mode` | `"paper" \| "live"` | ✅ Yes | Execution mode: `paper` for simulation, `live` for real trading |
| `trades` | `Trade[]` | ✅ Yes | Array of trades to execute (minimum 1 trade required) |

### Trade Object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `marketId` | `string` | ✅ Yes | Market identifier (hex ID like `0x1234...` or slug like `will-trump-win-2024`) |
| `outcome` | `"YES" \| "NO"` | ✅ Yes | Outcome to trade |
| `side` | `"BUY" \| "SELL"` | ✅ Yes | Order side: `BUY` to acquire position, `SELL` to reduce position |
| `orderType` | `"MARKET" \| "LIMIT"` | ✅ Yes | Order type: `MARKET` for immediate execution, `LIMIT` for specified price |
| `size` | `number` | ✅ Yes | Order size in USDC collateral (must be > 0) |
| `price` | `number` | Conditional | Limit price (required for `LIMIT` orders, ignored for `MARKET` orders). Must be between 0 and 1 (exclusive) |

## Examples

### Example 1: Simple Market Order

```json
{
  "$schema": "https://raw.githubusercontent.com/wesfloyd/betteroms/main/docs/schemas/trade-plan-v0.0.4.schema.json",
  "planId": "simple-market-001",
  "mode": "paper",
  "trades": [
    {
      "marketId": "0x1234567890abcdef1234567890abcdef12345678",
      "outcome": "YES",
      "side": "BUY",
      "orderType": "MARKET",
      "size": 100
    }
  ]
}
```

### Example 2: Limit Order

```json
{
  "$schema": "https://raw.githubusercontent.com/wesfloyd/betteroms/main/docs/schemas/trade-plan-v0.0.4.schema.json",
  "planId": "limit-order-001",
  "mode": "paper",
  "trades": [
    {
      "marketId": "will-trump-win-2024",
      "outcome": "YES",
      "side": "BUY",
      "orderType": "LIMIT",
      "size": 100,
      "price": 0.45
    }
  ]
}
```

### Example 3: Multi-Trade Plan

```json
{
  "$schema": "https://raw.githubusercontent.com/wesfloyd/betteroms/main/docs/schemas/trade-plan-v0.0.4.schema.json",
  "planId": "multi-trade-001",
  "mode": "paper",
  "trades": [
    {
      "marketId": "0x1234567890abcdef1234567890abcdef12345678",
      "outcome": "YES",
      "side": "BUY",
      "orderType": "MARKET",
      "size": 100
    },
    {
      "marketId": "will-trump-win-2024",
      "outcome": "NO",
      "side": "BUY",
      "orderType": "LIMIT",
      "size": 250,
      "price": 0.35
    },
    {
      "marketId": "0xabcdef1234567890abcdef1234567890abcdef12",
      "outcome": "YES",
      "side": "SELL",
      "orderType": "MARKET",
      "size": 50
    }
  ]
}
```

## Validation Rules

### Plan ID
- **Pattern**: `^[a-zA-Z0-9-_]+$`
- **Examples**:
  - ✅ `my-trade-001`
  - ✅ `TRADE_2024_Q1`
  - ❌ `my trade` (no spaces)
  - ❌ `trade@001` (no special chars)

### Market ID
- **Hex ID**: Starts with `0x`, followed by hexadecimal characters
  - Example: `0x1234567890abcdef1234567890abcdef12345678`
- **Slug**: Lowercase letters, numbers, and hyphens only
  - Example: `will-trump-win-2024`
  - ❌ `Will-Trump-Win` (no uppercase)
  - ❌ `will_trump_win` (no underscores)

### Size
- Must be a positive number (> 0)
- Represents USDC collateral amount
- Examples:
  - ✅ `100` ($100 worth)
  - ✅ `50.5` ($50.50 worth)
  - ❌ `0` (must be positive)
  - ❌ `-10` (must be positive)

### Price (for LIMIT orders)
- Must be between 0 and 1 (exclusive)
- Represents probability (0.45 = 45% probability)
- Examples:
  - ✅ `0.45` (45%)
  - ✅ `0.01` (1%)
  - ✅ `0.99` (99%)
  - ❌ `0` (must be > 0)
  - ❌ `1` (must be < 1)
  - ❌ `1.5` (must be < 1)

### Conditional Rules
- **LIMIT orders** MUST include `price` field
- **MARKET orders** can omit `price` field (ignored if provided)

## Schema Generation

This JSON Schema is **auto-generated** from the BetterOMS Zod schema, ensuring consistency between validation rules and documentation.

**Source of Truth**: [src/domain/schemas/trade-plan.schema.ts](../src/domain/schemas/trade-plan.schema.ts)

To regenerate the schema:
```bash
pnpm schema:generate
```

## Version History

| Version | Changes |
|---------|---------|
| v0.0.4 | Auto-generated from Zod schema (single source of truth) |
| v0.0.2 | Initial manual JSON Schema |

## Support

For issues or questions about the schema:
- Open an issue: https://github.com/wesfloyd/betteroms/issues
- See examples: `/test/trade-plans/` directory in the repo
