ALTER TABLE "farm" ADD COLUMN "milk_drop_percent" integer DEFAULT 20 NOT NULL;--> statement-breakpoint
ALTER TABLE "farm" ADD COLUMN "milk_drop_days" integer DEFAULT 2 NOT NULL;