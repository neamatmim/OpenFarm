-- Existing photos answered the only slot there was.
ALTER TABLE "completion_photo" ADD COLUMN "slot" integer DEFAULT 0;--> statement-breakpoint
UPDATE "completion_photo" SET "slot" = 0 WHERE "slot" IS NULL;--> statement-breakpoint
ALTER TABLE "completion_photo" ALTER COLUMN "slot" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "completion_photo" DROP CONSTRAINT "completion_photo_pkey";--> statement-breakpoint
ALTER TABLE "completion_photo" ADD PRIMARY KEY ("completion_id","slot");--> statement-breakpoint
CREATE INDEX "completion_photo_idx" ON "completion_photo" ("completion_id");