CREATE TYPE "public"."buyback_status" AS ENUM('PENDING_CONFIRMATION', 'ON_HOLD', 'PROCESSING', 'PAID', 'COMPLETED', 'REJECTED', 'CANCELLED', 'EXPIRED');--> statement-breakpoint
CREATE TABLE "buyback_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_ref" varchar(40) NOT NULL,
	"customer_id" uuid NOT NULL,
	"gram" numeric(20, 8) NOT NULL,
	"buyback_price_snapshot" numeric(18, 6) NOT NULL,
	"payout_amount_rm" numeric(18, 6) NOT NULL,
	"gold_price_id" uuid,
	"status" "buyback_status" DEFAULT 'PENDING_CONFIRMATION' NOT NULL,
	"otp_expires_at" timestamp with time zone NOT NULL,
	"confirmed_at" timestamp with time zone,
	"bank_name" varchar(128) NOT NULL,
	"bank_account_number" varchar(64) NOT NULL,
	"bank_account_holder_name" varchar(255) NOT NULL,
	"bank_confirmed_by_customer" boolean DEFAULT false NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"reject_reason" text,
	"payout_date" timestamp with time zone,
	"payout_reference" varchar(128),
	"payout_amount_paid" numeric(18, 6),
	"payout_processed_by" uuid,
	"payout_note" text,
	"completed_by" uuid,
	"completed_at" timestamp with time zone,
	"ledger_entry_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "buyback_requests_request_ref_unique" UNIQUE("request_ref")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "bank_account_holder_name" varchar(255);--> statement-breakpoint
ALTER TABLE "buyback_requests" ADD CONSTRAINT "buyback_requests_customer_id_users_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buyback_requests" ADD CONSTRAINT "buyback_requests_gold_price_id_gold_prices_id_fk" FOREIGN KEY ("gold_price_id") REFERENCES "public"."gold_prices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buyback_requests" ADD CONSTRAINT "buyback_requests_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buyback_requests" ADD CONSTRAINT "buyback_requests_payout_processed_by_users_id_fk" FOREIGN KEY ("payout_processed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buyback_requests" ADD CONSTRAINT "buyback_requests_completed_by_users_id_fk" FOREIGN KEY ("completed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buyback_requests" ADD CONSTRAINT "buyback_requests_ledger_entry_id_wallet_ledger_id_fk" FOREIGN KEY ("ledger_entry_id") REFERENCES "public"."wallet_ledger"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "buyback_requests_customer_id_idx" ON "buyback_requests" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "buyback_requests_status_idx" ON "buyback_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "buyback_requests_created_at_idx" ON "buyback_requests" USING btree ("created_at");
