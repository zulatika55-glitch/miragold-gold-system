DROP TABLE "upah_rates" CASCADE;--> statement-breakpoint
ALTER TABLE "redemptions" DROP COLUMN "upah_rate_per_gram_snapshot";--> statement-breakpoint
ALTER TABLE "redemptions" DROP COLUMN "upah_override_reason";
