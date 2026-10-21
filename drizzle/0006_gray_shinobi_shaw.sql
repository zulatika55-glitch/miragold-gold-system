CREATE TABLE "savings_targets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"target_gram" numeric(20, 8) NOT NULL,
	"monthly_budget_rm" numeric(18, 6),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "savings_targets_customer_id_unique" UNIQUE("customer_id")
);
--> statement-breakpoint
ALTER TABLE "savings_targets" ADD CONSTRAINT "savings_targets_customer_id_users_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
