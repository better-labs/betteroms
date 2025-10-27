import {
  pgTable,
  text,
  uuid,
  timestamp,
  decimal,
  jsonb,
  index,
} from 'drizzle-orm/pg-core';

/**
 * Execution History Table
 *
 * Tracks each trade plan execution with complete audit trail.
 * Uses plan_id as primary key for idempotency (prevents duplicate execution).
 */
export const executionHistory = pgTable(
  'execution_history',
  {
    // Primary key - unique identifier from trade plan (idempotency key)
    planId: text('plan_id').primaryKey(),

    // Complete trade plan JSON (preserves exact input for debugging and replay)
    planJson: jsonb('plan_json').notNull(),

    // Execution lifecycle status
    status: text('status', {
      enum: ['running', 'completed', 'failed'],
    }).notNull(),

    // Timestamps
    startedAt: timestamp('started_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),

    // Results and errors
    summaryJson: jsonb('summary_json'), // Run summary (orders placed, fills, P&L)
    errorMessage: text('error_message'), // Error details if failed
  },
  (table) => ({
    // Index for filtering by status and time
    statusIdx: index('execution_history_status_idx').on(table.status),
    startedAtIdx: index('execution_history_started_at_idx').on(table.startedAt),
  })
);

/**
 * Orders Table
 *
 * Tracks all orders from submission to completion.
 * Links orders to their originating trade plan execution.
 */
export const orders = pgTable(
  'orders',
  {
    // Primary key
    id: uuid('id').primaryKey().defaultRandom(),

    // Foreign key to execution_history
    planId: text('plan_id')
      .notNull()
      .references(() => executionHistory.planId, { onDelete: 'cascade' }),

    // Market identification
    marketTokenId: text('market_token_id').notNull(), // Polymarket ERC1155 token ID for specific outcome
    outcome: text('outcome', { enum: ['YES', 'NO'] }).notNull(),

    // Order parameters
    side: text('side', { enum: ['BUY', 'SELL'] }).notNull(),
    orderType: text('order_type', { enum: ['MARKET', 'LIMIT'] }).notNull(),
    size: decimal('size', { precision: 20, scale: 6 }).notNull(), // USDC collateral amount
    price: decimal('price', { precision: 10, scale: 6 }), // Limit price (0-1 range), nullable for MARKET orders

    // Order state
    status: text('status', {
      enum: ['open', 'filled', 'partially_filled', 'cancelled', 'failed'],
    }).notNull(),
    mode: text('mode', { enum: ['paper', 'live'] }).notNull(),

    // Timestamps
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),

    // Phase 3+: External order ID for reconciliation with Polymarket
    externalOrderId: text('external_order_id'),
  },
  (table) => ({
    // Indexes for common queries
    planIdIdx: index('orders_plan_id_idx').on(table.planId),
    marketStatusIdx: index('orders_market_status_idx').on(
      table.marketTokenId,
      table.status
    ),
    statusIdx: index('orders_status_idx').on(table.status),
  })
);

/**
 * Executions Table
 *
 * Immutable log of all order fills (partial or complete).
 * Foundation for position and P&L calculations.
 */
export const executions = pgTable(
  'executions',
  {
    // Primary key
    id: uuid('id').primaryKey().defaultRandom(),

    // Foreign key to orders
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),

    // Fill details
    quantity: decimal('quantity', { precision: 20, scale: 6 }).notNull(), // Token quantity filled
    price: decimal('price', { precision: 10, scale: 6 }).notNull(), // Actual execution price

    // Timestamp
    executedAt: timestamp('executed_at', { withTimezone: true })
      .notNull()
      .defaultNow(),

    // Phase 3+: External execution ID for reconciliation with Polymarket
    externalExecutionId: text('external_execution_id'),
  },
  (table) => ({
    // Indexes for position calculation queries
    orderIdIdx: index('executions_order_id_idx').on(table.orderId),
    executedAtIdx: index('executions_executed_at_idx').on(table.executedAt),
  })
);

// Export types for use in application code
export type ExecutionHistory = typeof executionHistory.$inferSelect;
export type NewExecutionHistory = typeof executionHistory.$inferInsert;

export type Order = typeof orders.$inferSelect;
export type NewOrder = typeof orders.$inferInsert;

export type Execution = typeof executions.$inferSelect;
export type NewExecution = typeof executions.$inferInsert;
