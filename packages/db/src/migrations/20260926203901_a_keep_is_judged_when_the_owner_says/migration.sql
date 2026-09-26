ALTER TABLE "farm" ADD COLUMN "keep_needs_days" integer DEFAULT 7 NOT NULL;--> statement-breakpoint
ALTER TABLE "farm" ADD COLUMN "keep_rate_gap_days" integer DEFAULT 7 NOT NULL;