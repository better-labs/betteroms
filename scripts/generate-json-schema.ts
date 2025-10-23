#!/usr/bin/env tsx

/**
 * Generate JSON Schema from Zod Schema
 *
 * This script converts the Zod trade plan schema into a JSON Schema file
 * that external users can reference for IDE autocomplete and validation.
 *
 * Usage: pnpm schema:generate
 */

import { zodToJsonSchema } from 'zod-to-json-schema';
import { TradePlanSchema, TRADE_PLAN_SCHEMA_VERSION } from '../src/domain/schemas/trade-plan.schema.js';
import fs from 'fs';
import path from 'path';

const OUTPUT_DIR = path.join(process.cwd(), 'docs/schemas');
const OUTPUT_FILE = path.join(OUTPUT_DIR, `trade-plan-${TRADE_PLAN_SCHEMA_VERSION}.schema.json`);

console.log('🔨 Generating JSON Schema from Zod...');
console.log(`   Version: ${TRADE_PLAN_SCHEMA_VERSION}`);

// Convert Zod schema to JSON Schema
const jsonSchema = zodToJsonSchema(TradePlanSchema, {
  name: 'TradePlan',
  $refStrategy: 'none', // Inline all definitions (simpler for external users)
  target: 'jsonSchema7',
  definitions: {},
});

// Add custom metadata
const enhancedSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  $id: `https://github.com/wesfloyd/betteroms/schemas/trade-plan-${TRADE_PLAN_SCHEMA_VERSION}.schema.json`,
  title: 'BetterOMS Trade Plan',
  description: `Trade plan schema for BetterOMS v${TRADE_PLAN_SCHEMA_VERSION} - single-user order management system for Polymarket`,
  version: TRADE_PLAN_SCHEMA_VERSION,
  ...jsonSchema,
};

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  console.log(`   Created directory: ${OUTPUT_DIR}`);
}

// Write JSON Schema to file
fs.writeFileSync(OUTPUT_FILE, JSON.stringify(enhancedSchema, null, 2) + '\n');

console.log(`✅ JSON Schema generated successfully!`);
console.log(`   Output: ${OUTPUT_FILE}`);
console.log('');
console.log('📖 External users can reference this schema in their JSON files:');
console.log('   {');
console.log(`     "$schema": "https://raw.githubusercontent.com/wesfloyd/betteroms/main/docs/schemas/trade-plan-${TRADE_PLAN_SCHEMA_VERSION}.schema.json",`);
console.log('     "planId": "...",');
console.log('     ...');
console.log('   }');
console.log('');
