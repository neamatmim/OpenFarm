ALTER TABLE "farm" ADD COLUMN "gain_read_days" integer DEFAULT 28 NOT NULL;--> statement-breakpoint
ALTER TABLE "ration" ADD COLUMN "expected_gain_low_kg" numeric(4,2);--> statement-breakpoint
ALTER TABLE "ration" ADD COLUMN "expected_gain_high_kg" numeric(4,2);