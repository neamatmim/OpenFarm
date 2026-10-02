CREATE TABLE "mortality_photo" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"mortality_id" text NOT NULL,
	"content_type" text NOT NULL,
	"data" text NOT NULL,
	"taken_by" text,
	"taken_at" timestamp NOT NULL,
	"replaced_at" timestamp
);
--> statement-breakpoint
CREATE INDEX "mortality_photo_mortality_idx" ON "mortality_photo" ("mortality_id");--> statement-breakpoint
ALTER TABLE "mortality_photo" ADD CONSTRAINT "mortality_photo_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "mortality_photo" ADD CONSTRAINT "mortality_photo_mortality_id_mortality_id_fkey" FOREIGN KEY ("mortality_id") REFERENCES "mortality"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "mortality_photo" ADD CONSTRAINT "mortality_photo_taken_by_user_id_fkey" FOREIGN KEY ("taken_by") REFERENCES "user"("id");