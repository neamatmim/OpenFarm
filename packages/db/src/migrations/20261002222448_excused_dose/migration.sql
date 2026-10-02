CREATE TABLE "excused_dose" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"animal_id" text NOT NULL,
	"definition_id" text NOT NULL,
	"reason" text NOT NULL,
	"excused_by" text,
	"excused_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "excused_dose_uidx" ON "excused_dose" ("animal_id","definition_id");--> statement-breakpoint
ALTER TABLE "excused_dose" ADD CONSTRAINT "excused_dose_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "excused_dose" ADD CONSTRAINT "excused_dose_animal_id_animal_id_fkey" FOREIGN KEY ("animal_id") REFERENCES "animal"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "excused_dose" ADD CONSTRAINT "excused_dose_definition_id_sop_definition_id_fkey" FOREIGN KEY ("definition_id") REFERENCES "sop_definition"("id");--> statement-breakpoint
ALTER TABLE "excused_dose" ADD CONSTRAINT "excused_dose_excused_by_user_id_fkey" FOREIGN KEY ("excused_by") REFERENCES "user"("id");