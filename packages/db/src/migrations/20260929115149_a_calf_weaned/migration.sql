CREATE TABLE "weaning" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"animal_id" text NOT NULL,
	"weaned_at" timestamp NOT NULL,
	"weight_kg" numeric(7,2),
	"to" text NOT NULL,
	"completion_id" text,
	"recorded_by" text,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "weaning_animal_uidx" ON "weaning" ("animal_id");--> statement-breakpoint
CREATE UNIQUE INDEX "weaning_completion_uidx" ON "weaning" ("completion_id");--> statement-breakpoint
ALTER TABLE "weaning" ADD CONSTRAINT "weaning_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "weaning" ADD CONSTRAINT "weaning_animal_id_animal_id_fkey" FOREIGN KEY ("animal_id") REFERENCES "animal"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "weaning" ADD CONSTRAINT "weaning_completion_id_step_completion_id_fkey" FOREIGN KEY ("completion_id") REFERENCES "step_completion"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "weaning" ADD CONSTRAINT "weaning_recorded_by_user_id_fkey" FOREIGN KEY ("recorded_by") REFERENCES "user"("id");