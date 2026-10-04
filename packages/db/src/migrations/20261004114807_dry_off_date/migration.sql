CREATE TABLE "dry_off" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"animal_id" text NOT NULL,
	"lactation_number" integer NOT NULL,
	"lactation_started_at" timestamp,
	"dried_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "dry_off_lactation_uidx" ON "dry_off" ("animal_id","lactation_number");--> statement-breakpoint
ALTER TABLE "dry_off" ADD CONSTRAINT "dry_off_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "dry_off" ADD CONSTRAINT "dry_off_animal_id_animal_id_fkey" FOREIGN KEY ("animal_id") REFERENCES "animal"("id");--> statement-breakpoint
-- A cow Dry today went Dry on the day her State changed, unless she was registered Dry: then that day is only when the
-- farm wrote her down, and her dry-off is not known. Earlier Lactations' dry-offs were overwritten at calving, and stay
-- unknown.
INSERT INTO "dry_off" ("id", "farm_id", "animal_id", "lactation_number", "lactation_started_at", "dried_at", "created_at")
SELECT gen_random_uuid()::text, "farm_id", "id", "lactation_number", "lactation_started_at", "state_changed_at", now()
FROM "animal"
WHERE "state" = 'dry'
  AND "lactation_number" > 0
  AND "state_changed_at" > "created_at" + interval '1 minute';
