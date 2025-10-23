# JSON Schemas

This directory contains auto-generated JSON Schema files for BetterOMS trade plans.

## ⚠️ DO NOT EDIT MANUALLY

These files are **auto-generated** from the Zod schema. Manual edits will be overwritten on the next build.

**Source of Truth**: [src/domain/schemas/trade-plan.schema.ts](../../src/domain/schemas/trade-plan.schema.ts)

## Current Schema

**Version**: v0.0.4
**File**: [trade-plan-v0.0.4.schema.json](./trade-plan-v0.0.4.schema.json)
**URL**: `https://raw.githubusercontent.com/wesfloyd/betteroms/main/docs/schemas/trade-plan-v0.0.4.schema.json`

## For External Users

Reference this schema in your JSON files to get IDE autocomplete:

```json
{
  "$schema": "https://raw.githubusercontent.com/wesfloyd/betteroms/main/docs/schemas/trade-plan-v0.0.4.schema.json",
  "planId": "your-trade-plan-id",
  "mode": "paper",
  "trades": [...]
}
```

See full documentation: [../trade-plan-schema.md](../trade-plan-schema.md)

## For Developers

To regenerate this schema after updating the Zod schema:

```bash
pnpm schema:generate
```

Or simply run build (which includes schema generation):

```bash
pnpm build
```

## Schema Versioning

When bumping the schema version:

1. Update `TRADE_PLAN_SCHEMA_VERSION` in [src/domain/schemas/trade-plan.schema.ts](../../src/domain/schemas/trade-plan.schema.ts)
2. Run `pnpm schema:generate`
3. Commit the new schema file
4. Keep old schema files for backward compatibility (if needed)

## Generation Script

**Location**: [scripts/generate-json-schema.ts](../../scripts/generate-json-schema.ts)

**Technology**: Uses `zod-to-json-schema` to convert Zod schema to JSON Schema Draft-07
