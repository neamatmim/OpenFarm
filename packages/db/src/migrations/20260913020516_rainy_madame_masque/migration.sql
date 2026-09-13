CREATE TABLE "calving" (
	"id" text PRIMARY KEY,
	"farm_id" text NOT NULL,
	"dam_id" text NOT NULL,
	"completion_id" text NOT NULL,
	"calved_at" timestamp NOT NULL,
	"ease" text NOT NULL,
	"service_id" text,
	"lactation_number" integer NOT NULL,
	"recorded_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "animal" ADD COLUMN "dam_id" text;--> statement-breakpoint
ALTER TABLE "animal" ADD COLUMN "calving_id" text;--> statement-breakpoint
ALTER TABLE "animal" ADD COLUMN "calf_position" integer;--> statement-breakpoint
ALTER TABLE "animal" ADD COLUMN "calf_outcome" text;--> statement-breakpoint
CREATE UNIQUE INDEX "calving_completion_uidx" ON "calving" ("completion_id");--> statement-breakpoint
CREATE INDEX "calving_dam_idx" ON "calving" ("dam_id","calved_at");--> statement-breakpoint
ALTER TABLE "calving" ADD CONSTRAINT "calving_farm_id_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "calving" ADD CONSTRAINT "calving_dam_id_animal_id_fkey" FOREIGN KEY ("dam_id") REFERENCES "animal"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "calving" ADD CONSTRAINT "calving_completion_id_step_completion_id_fkey" FOREIGN KEY ("completion_id") REFERENCES "step_completion"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "calving" ADD CONSTRAINT "calving_service_id_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "service"("id");--> statement-breakpoint
ALTER TABLE "calving" ADD CONSTRAINT "calving_recorded_by_user_id_fkey" FOREIGN KEY ("recorded_by") REFERENCES "user"("id");