ALTER TABLE "farm" ADD COLUMN "address" text;--> statement-breakpoint
ALTER TABLE "farm" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "farm" ADD COLUMN "registration_number" text;--> statement-breakpoint
ALTER TABLE "farm" ADD COLUMN "registration_office" text;--> statement-breakpoint
ALTER TABLE "farm" ADD COLUMN "registration_issued_on" timestamp;--> statement-breakpoint
ALTER TABLE "farm" ADD COLUMN "registration_expires_on" timestamp;--> statement-breakpoint
ALTER TABLE "farm" ADD COLUMN "registration_renewal_lead_days" integer DEFAULT 90 NOT NULL;