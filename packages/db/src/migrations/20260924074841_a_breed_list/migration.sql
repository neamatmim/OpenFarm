CREATE TABLE "breed" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"key" text,
	"name_bn" text NOT NULL,
	"name_en" text,
	"retired_at" timestamp,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "animal" ADD COLUMN "breed_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "breed_key_uidx" ON "breed" ("farm_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "breed_name_uidx" ON "breed" ("farm_id","name_bn");--> statement-breakpoint
ALTER TABLE "animal" ADD CONSTRAINT "animal_breed_id_breed_id_fkey" FOREIGN KEY ("breed_id") REFERENCES "breed"("id");--> statement-breakpoint
ALTER TABLE "breed" ADD CONSTRAINT "breed_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
-- Every breed typed before the list, once for each farm however its capitals fell, as the farm's own. The standard
-- breeds come later, the first time the list is opened, and pass over any name the farm already has.
INSERT INTO "breed" ("id", "farm_id", "key", "name_bn", "name_en", "created_at")
SELECT DISTINCT ON ("farm_id", lower(trim("breed")))
  gen_random_uuid()::text, "farm_id", NULL, trim("breed"), NULL, now()
FROM "animal"
WHERE "breed" IS NOT NULL AND trim("breed") <> ''
ORDER BY "farm_id", lower(trim("breed")), trim("breed");--> statement-breakpoint
-- Each animal then names the breed she was written down as.
UPDATE "animal" SET "breed_id" = "breed"."id"
FROM "breed"
WHERE "breed"."farm_id" = "animal"."farm_id"
  AND lower("breed"."name_bn") = lower(trim("animal"."breed"));
