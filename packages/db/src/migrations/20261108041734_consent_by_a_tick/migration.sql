ALTER TABLE "application_link" ADD COLUMN "opened_by_channel" text;--> statement-breakpoint
ALTER TABLE "application_link" ADD COLUMN "opened_code_sent_to" text;--> statement-breakpoint
ALTER TABLE "application_link" ADD COLUMN "opened_code_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "application_link" ADD CONSTRAINT "application_link_opened_by_channel_known" CHECK ("opened_by_channel" IN ('sms', 'email'));