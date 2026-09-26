ALTER TABLE "farm" ADD COLUMN "market_low_bdt_per_kg" numeric(12,2);--> statement-breakpoint
ALTER TABLE "farm" ADD COLUMN "market_high_bdt_per_kg" numeric(12,2);--> statement-breakpoint
ALTER TABLE "farm" ADD COLUMN "market_price_set_at" timestamp;