CREATE TYPE "public"."delivery_method" AS ENUM('PICKUP', 'DELIVERY');--> statement-breakpoint
CREATE TYPE "public"."redemption_status" AS ENUM('AWAITING_CUSTOMER_CONFIRMATION', 'PENDING_CONFIRMATION', 'AWAITING_PAYMENT', 'PAYMENT_CONFIRMED', 'PROCESSING', 'READY_FOR_FULFILLMENT', 'COMPLETED', 'REJECTED', 'CANCELLED', 'EXPIRED');--> statement-breakpoint
CREATE TABLE "redemptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"redemption_ref" varchar(40) NOT NULL,
	"customer_id" uuid NOT NULL,
	"product_name" varchar(255) NOT NULL,
	"sku" varchar(64) NOT NULL,
	"item_weight_gram" numeric(20, 8) NOT NULL,
	"gram_used" numeric(20, 8) NOT NULL,
	"sell_price_snapshot" numeric(18, 6) NOT NULL,
	"gold_price_id" uuid,
	"upah_rate_per_gram_snapshot" numeric(18, 6),
	"upah_rm" numeric(18, 6) NOT NULL,
	"upah_override_reason" text,
	"other_charges_rm" numeric(18, 6) DEFAULT '0' NOT NULL,
	"postage_rm" numeric(18, 6) DEFAULT '0' NOT NULL,
	"delivery_method" "delivery_method" DEFAULT 'PICKUP' NOT NULL,
	"delivery_details" jsonb,
	"delivery_tracking_reference" varchar(128),
	"status" "redemption_status" DEFAULT 'AWAITING_CUSTOMER_CONFIRMATION' NOT NULL,
	"otp_expires_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"payment_expires_at" timestamp with time zone,
	"billplz_url" varchar(512),
	"payment_confirmed_at" timestamp with time zone,
	"notes" text,
	"cancel_reason" text,
	"cancelled_by" uuid,
	"cancelled_at" timestamp with time zone,
	"processed_by" uuid,
	"processed_at" timestamp with time zone,
	"ready_by" uuid,
	"ready_at" timestamp with time zone,
	"completed_by" uuid,
	"completed_at" timestamp with time zone,
	"ledger_entry_id" uuid,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "redemptions_redemption_ref_unique" UNIQUE("redemption_ref")
);
--> statement-breakpoint
CREATE TABLE "upah_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rate_per_gram" numeric(18, 6) NOT NULL,
	"effective_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payments" ALTER COLUMN "order_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "pending_allocations" ALTER COLUMN "order_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "redemption_id" uuid;--> statement-breakpoint
ALTER TABLE "pending_allocations" ADD COLUMN "redemption_id" uuid;--> statement-breakpoint
ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_customer_id_users_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_gold_price_id_gold_prices_id_fk" FOREIGN KEY ("gold_price_id") REFERENCES "public"."gold_prices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_processed_by_users_id_fk" FOREIGN KEY ("processed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_ready_by_users_id_fk" FOREIGN KEY ("ready_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_completed_by_users_id_fk" FOREIGN KEY ("completed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_ledger_entry_id_wallet_ledger_id_fk" FOREIGN KEY ("ledger_entry_id") REFERENCES "public"."wallet_ledger"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upah_rates" ADD CONSTRAINT "upah_rates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "redemptions_customer_id_idx" ON "redemptions" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "redemptions_status_idx" ON "redemptions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "redemptions_created_at_idx" ON "redemptions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "upah_rates_effective_at_idx" ON "upah_rates" USING btree ("effective_at");--> statement-breakpoint
CREATE INDEX "payments_redemption_id_idx" ON "payments" USING btree ("redemption_id");
