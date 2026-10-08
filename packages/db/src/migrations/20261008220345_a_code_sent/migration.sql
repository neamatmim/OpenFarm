ALTER TABLE "investor_access" ADD COLUMN "code_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "investor_access" ADD COLUMN "code_sent_by_sms" text;--> statement-breakpoint
ALTER TABLE "investor_access" ADD COLUMN "code_sent_by_email" text;