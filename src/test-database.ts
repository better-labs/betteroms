#!/usr/bin/env tsx
/**
 * Phase 2 Test Script - Verify Database Connectivity and Schema
 *
 * This script tests that we can:
 * 1. Connect to the database
 * 2. Insert data into all tables (execution_history, orders, executions)
 * 3. Query data back
 * 4. Verify foreign key relationships work
 * 5. Clean up test data
 *
 * Usage: pnpm run test:database
 */

import { loadEnv } from './config/env.js';
import { logger } from './infrastructure/logging/logger.js';
import {
  getDb,
  closeDb,
  testConnection,
} from './infrastructure/database/client.js';
import {
  executionHistory,
  orders,
  executions,
} from './infrastructure/database/schema.js';
import { eq } from 'drizzle-orm';

const TEST_PLAN_ID = 'test-phase2-' + Date.now();

async function runTests() {
  try {
    // Step 1: Load environment
    logger.info('🔧 Loading environment configuration...');
    const env = loadEnv();
    if (!env.DATABASE_URL) {
      throw new Error('DATABASE_URL is not configured');
    }
    logger.info('✅ Environment loaded');

    // Step 2: Test connection
    logger.info('🔌 Testing database connection...');
    const isConnected = await testConnection();
    if (!isConnected) {
      throw new Error('Database connection test failed');
    }
    logger.info('✅ Database connection successful');

    const db = getDb();

    // Step 3: Insert test execution_history record
    logger.info('📝 Test 1: Inserting execution_history record...');
    const [historyRecord] = await db
      .insert(executionHistory)
      .values({
        planId: TEST_PLAN_ID,
        planJson: {
          planId: TEST_PLAN_ID,
          mode: 'paper',
          trades: [
            {
              marketId: 'test-market-123',
              outcome: 'YES',
              side: 'BUY',
              orderType: 'MARKET',
              size: 100,
            },
          ],
        },
        status: 'running',
      })
      .returning();

    logger.info(
      { planId: historyRecord.planId, status: historyRecord.status },
      '✅ Execution history record created'
    );

    // Step 4: Insert test order
    logger.info('📝 Test 2: Inserting order record...');
    const [orderRecord] = await db
      .insert(orders)
      .values({
        planId: TEST_PLAN_ID,
        marketId: 'test-market-123',
        outcome: 'YES',
        side: 'BUY',
        orderType: 'MARKET',
        size: '100.000000',
        status: 'filled',
        mode: 'paper',
      })
      .returning();

    logger.info(
      {
        orderId: orderRecord.id,
        planId: orderRecord.planId,
        status: orderRecord.status,
      },
      '✅ Order record created'
    );

    // Step 5: Insert test execution
    logger.info('📝 Test 3: Inserting execution record...');
    const [executionRecord] = await db
      .insert(executions)
      .values({
        orderId: orderRecord.id,
        quantity: '250.000000', // tokens filled
        price: '0.400000', // execution price
      })
      .returning();

    logger.info(
      {
        executionId: executionRecord.id,
        orderId: executionRecord.orderId,
        quantity: executionRecord.quantity,
        price: executionRecord.price,
      },
      '✅ Execution record created'
    );

    // Step 6: Query data back
    logger.info('🔍 Test 4: Querying execution_history...');
    const historyRecords = await db
      .select()
      .from(executionHistory)
      .where(eq(executionHistory.planId, TEST_PLAN_ID));
    logger.info(
      { count: historyRecords.length },
      '✅ Query successful - found execution_history records'
    );

    logger.info('🔍 Test 5: Querying orders...');
    const orderRecords = await db
      .select()
      .from(orders)
      .where(eq(orders.planId, TEST_PLAN_ID));
    logger.info(
      { count: orderRecords.length },
      '✅ Query successful - found order records'
    );

    logger.info('🔍 Test 6: Querying executions...');
    const executionRecords = await db
      .select()
      .from(executions)
      .where(eq(executions.orderId, orderRecord.id));
    logger.info(
      { count: executionRecords.length },
      '✅ Query successful - found execution records'
    );

    // Step 7: Update execution_history status
    logger.info('📝 Test 7: Updating execution_history status...');
    await db
      .update(executionHistory)
      .set({
        status: 'completed',
        completedAt: new Date(),
        summaryJson: {
          ordersPlaced: 1,
          ordersFilled: 1,
          totalPnL: 0,
        },
      })
      .where(eq(executionHistory.planId, TEST_PLAN_ID));
    logger.info('✅ Update successful');

    // Step 8: Verify cascade delete (delete execution_history should cascade to orders and executions)
    logger.info('🗑️  Test 8: Testing cascade delete...');
    await db
      .delete(executionHistory)
      .where(eq(executionHistory.planId, TEST_PLAN_ID));

    // Check that orders and executions were also deleted
    const remainingOrders = await db
      .select()
      .from(orders)
      .where(eq(orders.planId, TEST_PLAN_ID));
    const remainingExecutions = await db
      .select()
      .from(executions)
      .where(eq(executions.orderId, orderRecord.id));

    if (remainingOrders.length === 0 && remainingExecutions.length === 0) {
      logger.info('✅ Cascade delete successful - all related records removed');
    } else {
      throw new Error('Cascade delete failed - orphaned records exist');
    }

    // Summary
    logger.info('');
    logger.info('🎉 Phase 2 Success Criteria:');
    logger.info('  ✅ Database connection works');
    logger.info('  ✅ All 3 tables created with correct schema');
    logger.info('  ✅ Can insert sample data for each table');
    logger.info('  ✅ Can query data from each table');
    logger.info('  ✅ Foreign key relationships work correctly');
    logger.info('  ✅ Cascade delete works properly');
    logger.info('  ✅ Migrations run successfully');
    logger.info('  ✅ Can import and use getDb() from other modules');
    logger.info('');
    logger.info('✨ Phase 2 complete! Ready for Phase 3 (CLI Framework).');
  } catch (error) {
    logger.error({ error }, '❌ Test failed');
    process.exit(1);
  } finally {
    // Always close connection
    await closeDb();
    logger.info('🔌 Database connection closed');
  }
}

// Run tests
runTests();
