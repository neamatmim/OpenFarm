CREATE TABLE "alert" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text NOT NULL,
	"params" jsonb NOT NULL,
	"created_at" timestamp NOT NULL,
	"dismissed_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "farm" ADD COLUMN "escalation_minutes" integer DEFAULT 120 NOT NULL;--> statement-breakpoint
ALTER TABLE "sop_instance" ADD COLUMN "checker_role" text;--> statement-breakpoint
-- The checker Role is pinned from the Version, exactly as the assigned Role already is.
-- Instances raised before this column existed take it from the Version they were raised on,
-- so work already waiting does not fall out of the sign-off queue.
UPDATE "sop_instance" SET "checker_role" = "sop_version"."content"->>'checkerRole'
FROM "sop_version"
WHERE "sop_version"."id" = "sop_instance"."version_id"
  AND "sop_version"."content"->>'checkerRole' IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "alert_once_uidx" ON "alert" ("user_id","kind","entity_id");--> statement-breakpoint
CREATE INDEX "alert_inbox_idx" ON "alert" ("user_id","dismissed_at","created_at");--> statement-breakpoint
ALTER TABLE "alert" ADD CONSTRAINT "alert_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "alert" ADD CONSTRAINT "alert_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;