ALTER TABLE "sale" ADD COLUMN "baki_bdt" numeric(12,2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "sale" ADD COLUMN "promised_by" text;--> statement-breakpoint
ALTER TABLE "dispatch" ADD COLUMN "baki_bdt" numeric(12,2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "dispatch" ADD COLUMN "promised_by" text;