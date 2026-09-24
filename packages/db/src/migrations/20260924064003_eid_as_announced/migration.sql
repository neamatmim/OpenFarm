CREATE TABLE "eid_announcement" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"day" text NOT NULL,
	"expected_day" text NOT NULL,
	"announced_by" text,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE INDEX "eid_announcement_idx" ON "eid_announcement" ("farm_id","expected_day");--> statement-breakpoint
ALTER TABLE "eid_announcement" ADD CONSTRAINT "eid_announcement_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "eid_announcement" ADD CONSTRAINT "eid_announcement_announced_by_user_id_fkey" FOREIGN KEY ("announced_by") REFERENCES "user"("id");