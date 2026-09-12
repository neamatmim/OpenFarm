CREATE TABLE "service" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"animal_id" text NOT NULL,
	"completion_id" text NOT NULL,
	"method" text NOT NULL,
	"sire_straw" text,
	"sire_animal_id" text,
	"served_by" text,
	"heat_id" text,
	"served_at" timestamp NOT NULL,
	"recorded_by" text,
	"recorded_by_role" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "service_completion_uidx" ON "service" ("completion_id");--> statement-breakpoint
CREATE INDEX "service_animal_idx" ON "service" ("animal_id","served_at");--> statement-breakpoint
ALTER TABLE "service" ADD CONSTRAINT "service_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "service" ADD CONSTRAINT "service_animal_id_animal_id_fkey" FOREIGN KEY ("animal_id") REFERENCES "animal"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "service" ADD CONSTRAINT "service_completion_id_step_completion_id_fkey" FOREIGN KEY ("completion_id") REFERENCES "step_completion"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "service" ADD CONSTRAINT "service_sire_animal_id_animal_id_fkey" FOREIGN KEY ("sire_animal_id") REFERENCES "animal"("id");--> statement-breakpoint
ALTER TABLE "service" ADD CONSTRAINT "service_heat_id_observation_id_fkey" FOREIGN KEY ("heat_id") REFERENCES "observation"("id");--> statement-breakpoint
ALTER TABLE "service" ADD CONSTRAINT "service_recorded_by_user_id_fkey" FOREIGN KEY ("recorded_by") REFERENCES "user"("id");