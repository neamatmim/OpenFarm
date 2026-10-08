ALTER TABLE "investment_agreement" ADD COLUMN "signed_on" text;--> statement-breakpoint
-- Every Agreement recorded before the signing day was asked reads the farm day it was recorded on.
UPDATE "investment_agreement" SET "signed_on" = to_char("created_at" AT TIME ZONE 'Asia/Dhaka', 'YYYY-MM-DD');--> statement-breakpoint
ALTER TABLE "investment_agreement" ALTER COLUMN "signed_on" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "investment_agreement" ADD CONSTRAINT "investment_agreement_signed_on_day" CHECK ("signed_on" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$');
