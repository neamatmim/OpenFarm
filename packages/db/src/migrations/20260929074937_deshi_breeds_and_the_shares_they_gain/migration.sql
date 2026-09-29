ALTER TABLE "farm" ADD COLUMN "deshi_gain_percent" integer DEFAULT 70 NOT NULL;--> statement-breakpoint
ALTER TABLE "farm" ADD COLUMN "female_gain_percent" integer DEFAULT 80 NOT NULL;--> statement-breakpoint
ALTER TABLE "breed" ADD COLUMN "deshi" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- The standard breeds that are the country's own cattle, as the domain's DESHI_BREEDS names them.
UPDATE "breed" SET "deshi" = true WHERE "key" IN ('local', 'redChittagong', 'pabna', 'munshiganj', 'northBengalGrey');
