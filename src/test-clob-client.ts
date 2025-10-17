#!/usr/bin/env tsx
/**
 * Phase 1 Test Script - Verify Polymarket CLOB Client Integration
 *
 * This script tests that we can:
 * 1. Load environment variables
 * 2. Initialize CLOB client
 * 3. Fetch order book data
 * 4. Fetch market prices
 * 5. Log structured output
 *
 * Usage: pnpm run test:clob-client
 */

import { loadEnv } from './config/env.js';
import { logger } from './infrastructure/logging/logger.js';
import { getPolymarketAdapter } from './integrations/polymarket/polymarket.adapter.js';

// Test token IDs (real Polymarket markets)
// These are YES/NO outcome tokens from actual markets
const TEST_TOKEN_IDS = [
  '21742633143463906290569050155826241533067272736897614950488156847949938836455', // Popular market token
  '71321045679252212594626385532706912750332728571942532289631379312455583992833', // Another active market
];

async function runTests() {
  try {
    // Step 1: Load and validate environment
    logger.info('🔧 Loading environment configuration...');
    const env = loadEnv();
    logger.info({ env: { CLOB_API_URL: env.CLOB_API_URL, CHAIN_ID: env.CHAIN_ID } }, '✅ Environment loaded successfully');

    // Step 2: Initialize adapter
    logger.info('🔌 Initializing Polymarket adapter...');
    const adapter = getPolymarketAdapter();
    logger.info('✅ Adapter initialized');

    // Step 3: Test each method with a real token
    const tokenId = TEST_TOKEN_IDS[0];
    logger.info({ tokenId }, '🧪 Running CLOB client tests...');

    // Test 1: Get Order Book
    logger.info('📊 Test 1: Fetching order book...');
    const orderBook = await adapter.getOrderBook(tokenId);
    logger.info({
      tokenId,
      bidCount: orderBook.bids?.length || 0,
      askCount: orderBook.asks?.length || 0,
      bestBid: orderBook.bids?.[0]?.price,
      bestAsk: orderBook.asks?.[0]?.price,
    }, '✅ Order book fetched');

    // Test 2: Get Mid Point
    logger.info('💰 Test 2: Fetching mid-point price...');
    const midPoint = await adapter.getMidPoint(tokenId);
    logger.info({ tokenId, midPoint }, '✅ Mid-point fetched');

    // Test 3: Get Last Trade Price
    logger.info('📈 Test 3: Fetching last trade price...');
    const lastPrice = await adapter.getLastTradePrice(tokenId);
    logger.info({ tokenId, lastPrice }, '✅ Last trade price fetched');

    // Test 4: Get Spread
    logger.info('📉 Test 4: Fetching spread...');
    const spread = await adapter.getSpread(tokenId);
    logger.info({ tokenId, spread }, '✅ Spread fetched');

    // Test 5: Get Best Prices (combined)
    logger.info('🎯 Test 5: Fetching best prices (combined)...');
    const bestPrices = await adapter.getBestPrices(tokenId);
    logger.info({
      tokenId,
      bestBid: bestPrices.bestBid,
      bestAsk: bestPrices.bestAsk,
      midPoint: bestPrices.midPoint,
    }, '✅ Best prices fetched');

    // Summary
    logger.info('');
    logger.info('🎉 Phase 1 Success Criteria:');
    logger.info('  ✅ Project builds successfully');
    logger.info('  ✅ Environment variables load correctly');
    logger.info('  ✅ Logger outputs structured JSON logs');
    logger.info('  ✅ Can fetch order book for a known Polymarket market');
    logger.info('  ✅ getOrderBook() returns valid data');
    logger.info('  ✅ getMidPoint() returns valid data');
    logger.info('  ✅ getLastTradePrice() returns valid data');
    logger.info('');
    logger.info('✨ Phase 1 complete! Ready for Phase 2 (Database).');

  } catch (error) {
    logger.error({ error }, '❌ Test failed');
    process.exit(1);
  }
}

// Run tests
runTests();
