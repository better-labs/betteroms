CREATE TABLE IF NOT EXISTS "execution_history" (
	"plan_id" text PRIMARY KEY NOT NULL,
	"plan_json" jsonb NOT NULL,
	"status" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"summary_json" jsonb,
	"error_message" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "executions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"quantity" numeric(20, 6) NOT NULL,
	"price" numeric(10, 6) NOT NULL,
	"executed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"external_execution_id" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" text NOT NULL,
	"market_id" text NOT NULL,
	"outcome" text NOT NULL,
	"side" text NOT NULL,
	"order_type" text NOT NULL,
	"size" numeric(20, 6) NOT NULL,
	"price" numeric(10, 6),
	"status" text NOT NULL,
	"mode" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"external_order_id" text
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "executions" ADD CONSTRAINT "executions_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "orders" ADD CONSTRAINT "orders_plan_id_execution_history_plan_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."execution_history"("plan_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "execution_history_status_idx" ON "execution_history" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "execution_history_started_at_idx" ON "execution_history" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "executions_order_id_idx" ON "executions" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "executions_executed_at_idx" ON "executions" USING btree ("executed_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "orders_plan_id_idx" ON "orders" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "orders_market_status_idx" ON "orders" USING btree ("market_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "orders_status_idx" ON "orders" USING btree ("status");