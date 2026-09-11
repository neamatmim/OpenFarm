CREATE TABLE "sighting" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"animal_id" text NOT NULL,
	"completion_id" text NOT NULL,
	"saw" text NOT NULL,
	"note" text,
	"seen_by" text,
	"seen_at" timestamp NOT NULL,
	"withdrawn_at" timestamp,
	"superseded_by_id" text,
	"recorded_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE INDEX "sighting_animal_idx" ON "sighting" ("animal_id","seen_at");--> statement-breakpoint
CREATE UNIQUE INDEX "sighting_completion_uidx" ON "sighting" ("completion_id") WHERE "withdrawn_at" is null;--> statement-breakpoint
ALTER TABLE "sighting" ADD CONSTRAINT "sighting_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "sighting" ADD CONSTRAINT "sighting_animal_id_animal_id_fkey" FOREIGN KEY ("animal_id") REFERENCES "animal"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "sighting" ADD CONSTRAINT "sighting_seen_by_user_id_fkey" FOREIGN KEY ("seen_by") REFERENCES "user"("id");