ALTER TABLE "orders" RENAME COLUMN "market_id" TO "market_token_id";--> statement-breakpoint
DROP INDEX IF EXISTS "orders_market_status_idx";--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "orders_market_status_idx" ON "orders" USING btree ("market_token_id","status");