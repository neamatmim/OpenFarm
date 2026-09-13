ALTER TABLE "mortality" ALTER COLUMN "disposal" DROP NOT NULL;--> statement-breakpoint
-- A calf recorded stillborn before her Calving wrote her death has none: she goes on the register now, her
-- disposal awaited like any other stillbirth's.
INSERT INTO "mortality" ("id", "farm_id", "animal_id", "kind", "happened_at", "cause", "disposal", "recorded_at")
SELECT gen_random_uuid()::text, "animal"."farm_id", "animal"."id", 'died', "animal"."state_changed_at", 'stillbirth', NULL, now()
FROM "animal"
WHERE "animal"."calf_outcome" = 'stillborn'
  AND NOT EXISTS (SELECT 1 FROM "mortality" WHERE "mortality"."animal_id" = "animal"."id");--> statement-breakpoint
-- A calf is in her Pen from the hour she was born, not from when her Calving was written down.
UPDATE "animal_move" SET "moved_at" = "animal"."birth_date"
FROM "animal"
WHERE "animal_move"."animal_id" = "animal"."id"
  AND "animal_move"."reason" = 'born'
  AND "animal_move"."from_pen_id" IS NULL
  AND "animal"."birth_date" IS NOT NULL;
