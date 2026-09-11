ALTER TABLE "alert" ADD COLUMN "carried_at" timestamp;--> statement-breakpoint
ALTER TABLE "farm" ADD COLUMN "digest_times" text[] DEFAULT '{06:00,18:00}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "farm" ADD COLUMN "quiet_from" text DEFAULT '22:00' NOT NULL;--> statement-breakpoint
ALTER TABLE "farm" ADD COLUMN "quiet_until" text DEFAULT '05:00' NOT NULL;