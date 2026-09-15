CREATE TYPE "public"."account_status" AS ENUM('ACTIVE', 'SUSPENDED', 'REVIEW', 'CLOSED');--> statement-breakpoint
CREATE TYPE "public"."actor_type" AS ENUM('CUSTOMER', 'STAFF', 'SUPERVISOR', 'ADMIN', 'OWNER', 'SYSTEM');--> statement-breakpoint
CREATE TYPE "public"."ledger_direction" AS ENUM('IN', 'OUT');--> statement-breakpoint
CREATE TYPE "public"."ledger_type" AS ENUM('LOCK_BUY', 'REDEMPTION', 'BUYBACK', 'CONVERSION', 'TRADE_IN', 'ADJUSTMENT', 'REVERSAL');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('PENDING', 'CONFIRMED', 'COMPLETED', 'FAILED', 'EXPIRED', 'CANCELLED', 'REVERSED');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('PENDING', 'PAID', 'FAILED', 'REVERSED');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('CUSTOMER', 'STAFF', 'SUPERVISOR', 'ADMIN', 'OWNER');--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"actor_type" "actor_type" NOT NULL,
	"action" varchar(128) NOT NULL,
	"entity" varchar(64) NOT NULL,
	"entity_id" varchar(64) NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"reason" text,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gold_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sell_price_916" numeric(18, 6) NOT NULL,
	"buyback_price_916" numeric(18, 6) NOT NULL,
	"effective_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_ref" varchar(40) NOT NULL,
	"customer_id" uuid NOT NULL,
	"amount_rm" numeric(18, 6) NOT NULL,
	"price_snapshot" numeric(18, 6) NOT NULL,
	"gram" numeric(20, 8) NOT NULL,
	"gold_price_id" uuid,
	"status" "order_status" DEFAULT 'PENDING' NOT NULL,
	"lock_expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_order_ref_unique" UNIQUE("order_ref")
);
--> statement-breakpoint
CREATE TABLE "otp_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone" varchar(32) NOT NULL,
	"code_hash" varchar(255) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"attempts" numeric(4, 0) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_ref" varchar(40) NOT NULL,
	"order_id" uuid NOT NULL,
	"provider" varchar(32) DEFAULT 'BILLPLZ' NOT NULL,
	"provider_bill_id" varchar(128),
	"idempotency_key" varchar(191) NOT NULL,
	"amount" numeric(18, 6) NOT NULL,
	"status" "payment_status" DEFAULT 'PENDING' NOT NULL,
	"raw_payload" jsonb,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_payment_ref_unique" UNIQUE("payment_ref"),
	CONSTRAINT "payments_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "pending_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"resolved" boolean DEFAULT false NOT NULL,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" varchar(32) NOT NULL,
	"name" varchar(255) NOT NULL,
	"phone" varchar(32) NOT NULL,
	"email" varchar(255),
	"role" "user_role" DEFAULT 'CUSTOMER' NOT NULL,
	"status" "account_status" DEFAULT 'ACTIVE' NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"bank_name" varchar(128),
	"bank_account_number" varchar(64),
	"bank_details_updated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_customer_id_unique" UNIQUE("customer_id"),
	CONSTRAINT "users_phone_unique" UNIQUE("phone")
);
--> statement-breakpoint
CREATE TABLE "wallet_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ledger_ref" varchar(40) NOT NULL,
	"customer_id" uuid NOT NULL,
	"type" "ledger_type" NOT NULL,
	"direction" "ledger_direction" NOT NULL,
	"gram" numeric(20, 8) NOT NULL,
	"price_snapshot" numeric(18, 6),
	"ref_type" varchar(32) NOT NULL,
	"ref_id" varchar(40) NOT NULL,
	"balance_after" numeric(20, 8) NOT NULL,
	"reversal_of_ledger_id" uuid,
	"reason" text,
	"created_by" uuid,
	"approved_by" uuid,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wallet_ledger_ledger_ref_unique" UNIQUE("ledger_ref")
);
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gold_prices" ADD CONSTRAINT "gold_prices_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_users_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_gold_price_id_gold_prices_id_fk" FOREIGN KEY ("gold_price_id") REFERENCES "public"."gold_prices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_allocations" ADD CONSTRAINT "pending_allocations_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_allocations" ADD CONSTRAINT "pending_allocations_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_ledger" ADD CONSTRAINT "wallet_ledger_customer_id_users_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_ledger" ADD CONSTRAINT "wallet_ledger_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_ledger" ADD CONSTRAINT "wallet_ledger_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_logs_entity_idx" ON "audit_logs" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE INDEX "audit_logs_timestamp_idx" ON "audit_logs" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "gold_prices_effective_at_idx" ON "gold_prices" USING btree ("effective_at");--> statement-breakpoint
CREATE INDEX "orders_customer_id_idx" ON "orders" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "orders_status_idx" ON "orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "otp_codes_phone_idx" ON "otp_codes" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "payments_order_id_idx" ON "payments" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_idempotency_key_idx" ON "payments" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "users_phone_idx" ON "users" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "users_customer_id_idx" ON "users" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "wallet_ledger_customer_id_idx" ON "wallet_ledger" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "wallet_ledger_timestamp_idx" ON "wallet_ledger" USING btree ("timestamp");