CREATE TYPE "public"."redemption_source" AS ENUM('WALK_IN', 'WHATSAPP', 'TIKTOK_LIVE', 'CATALOG', 'OTHER');--> statement-breakpoint
ALTER TABLE "redemptions" ADD COLUMN "source" "redemption_source" DEFAULT 'OTHER' NOT NULL;
