ALTER TABLE "application_code" ADD COLUMN "email_code_hash" text;--> statement-breakpoint
ALTER TABLE "application_code" ADD COLUMN "email_to" text;--> statement-breakpoint
ALTER TABLE "investor_application" ADD COLUMN "code_channel" text DEFAULT 'sms' NOT NULL;--> statement-breakpoint
ALTER TABLE "application_code" ALTER COLUMN "code_hash" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "application_code" ALTER COLUMN "sent_to" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "application_code" ADD CONSTRAINT "application_code_went_somewhere" CHECK ("code_hash" is not null or "email_code_hash" is not null);--> statement-breakpoint
ALTER TABLE "investor_application" ADD CONSTRAINT "investor_application_code_channel_known" CHECK ("code_channel" IN ('sms', 'email'));