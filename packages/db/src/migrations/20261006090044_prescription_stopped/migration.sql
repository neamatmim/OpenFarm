ALTER TABLE "prescription" ADD COLUMN "stopped_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "prescription" ADD COLUMN "stopped_by" text;--> statement-breakpoint
ALTER TABLE "prescription" ADD COLUMN "stopped_reason" text;--> statement-breakpoint
ALTER TABLE "prescription" ADD CONSTRAINT "prescription_stopped_by_user_id_fkey" FOREIGN KEY ("stopped_by") REFERENCES "user"("id");