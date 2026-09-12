ALTER TABLE "farm" ADD COLUMN "dry_off_lead_days" integer DEFAULT 60 NOT NULL;--> statement-breakpoint
ALTER TABLE "farm" ADD COLUMN "calving_prep_lead_days" integer DEFAULT 7 NOT NULL;--> statement-breakpoint
ALTER TABLE "animal" ADD COLUMN "expected_calving_service_id" text;