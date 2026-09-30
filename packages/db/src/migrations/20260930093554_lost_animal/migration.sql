ALTER TABLE "farm" ADD COLUMN "missing_write_off_days" integer DEFAULT 7 NOT NULL;--> statement-breakpoint
ALTER TABLE "missing" ADD COLUMN "written_off_at" timestamp;--> statement-breakpoint
ALTER TABLE "missing" ADD COLUMN "written_off_by" text;--> statement-breakpoint
ALTER TABLE "missing" ADD COLUMN "lost_cause" text;--> statement-breakpoint
ALTER TABLE "missing" ADD COLUMN "stolen" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "missing" ADD COLUMN "gd_number" text;--> statement-breakpoint
ALTER TABLE "missing" ADD COLUMN "state_before" text;--> statement-breakpoint
ALTER TABLE "missing" ADD COLUMN "state_changed_before" timestamp;--> statement-breakpoint
DROP INDEX "missing_open_uidx";--> statement-breakpoint
CREATE UNIQUE INDEX "missing_open_uidx" ON "missing" ("animal_id") WHERE "found_at" is null and "written_off_at" is null;--> statement-breakpoint
ALTER TABLE "missing" ADD CONSTRAINT "missing_written_off_by_user_id_fkey" FOREIGN KEY ("written_off_by") REFERENCES "user"("id");